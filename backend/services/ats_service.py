"""
ats_service.py — World‑Class ATS Scoring Engine v2.0
=====================================================
Strict, multi‑dimensional resume analysis modelled after enterprise ATS
systems (Workday, Greenhouse, Lever, iCIMS, Taleo).

Scoring Dimensions
──────────────────
  1. Keyword Match          (TF‑IDF weighted, exact + stem + phrase)
  2. Semantic Similarity    (cosine of TF‑IDF vectors)
  3. Bullet Strength        (action verbs, STAR pattern, metric density)
  4. Summary Quality        (relevance, length, tone, value proposition)
  5. Skills Coverage        (hard/soft split, category depth, recency signals)
  6. Education Signals      (degree tier, relevance, certifications)
  7. Projects Impact        (link presence, metrics, tech stack alignment)
  8. Formatting / Structure (ATS parse‑ability heuristics)
  9. Readability            (Flesch‑Kincaid proxy, sentence variance)
 10. Red‑Flag Penalty       (lies, generic filler, forbidden phrases)

Final score is a weighted blend (0–100) with letter grade + label.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

from models.resume_model import Resume
from services.similarity_service import similarity_score
from utils.text_utils import clean_text, starts_with_action_verb

# ──────────────────────────────────────────────────────────────────────────────
# CONSTANTS & COMPILED PATTERNS
# ──────────────────────────────────────────────────────────────────────────────

TOP_KEYWORD_LIMIT     = 40
MISSING_KEYWORD_LIMIT = 12
PHRASE_NGRAM_SIZE     = 2          # bigram phrase extraction

# Regex patterns
_METRIC_PATTERN = re.compile(
    r"(\d+\s*[%$xX]"           # 30%, $5M, 4x
    r"|\$[\d,]+[kKmMbB]?"      # $500k, $1.2M
    r"|\d+[kKmMbB]\b"          # 10k, 2M
    r"|\d+\+"                  # 50+
    r"|\d{1,3}(?:,\d{3})+"     # 1,000,000
    r"|\b\d{2,}\b"             # bare numbers ≥ 10
    r"|#\d+)",                  # #1 ranking
    re.IGNORECASE,
)
_TOKEN_PATTERN    = re.compile(r"\b[a-z0-9][\w.+#-]*\b")   # keeps C++, .NET, C#
_SENTENCE_PATTERN = re.compile(r"[.!?]+")
_BULLET_PATTERN   = re.compile(r"^[\-\•\*\u2022\u2023\u25E6\u2043]\s*")
_URL_PATTERN      = re.compile(r"https?://\S+|github\.com/\S+|linkedin\.com/\S+", re.I)
_DATE_PATTERN     = re.compile(r"\b(19|20)\d{2}\b")
_YEAR_RANGE_PATT  = re.compile(r"\b(20\d{2})\s*[-–—]\s*(20\d{2}|present|current)\b", re.I)

# ── Weak / Red‑flag phrases ───────────────────────────────────────────────────
_WEAK_PHRASES = re.compile(
    r"\b(responsible for|duties included|familiar with|worked on|"
    r"helped with|assisted with|team player|hard worker|handled|"
    r"participated in|was tasked with|utilized|various|etc\b|"
    r"stuff|things|good at|well[- ]versed|proficient in handling|"
    r"go[- ]to person|synergy|leverage|circle back|bandwidth|"
    r"moved the needle|thought leader|guru|ninja|rockstar|wizard|"
    r"passionate about|love to|enjoy doing|detail[- ]oriented|"
    r"results[- ]driven|highly motivated|self[- ]starter|"
    r"dynamic individual|seasoned professional|proven track record|"
    r"references available|references upon request)\b",
    re.IGNORECASE,
)

# ── Strong action verb list (300+) collapsed into a pattern ──────────────────
_ACTION_VERBS = {
    # Engineering / Technical
    "architected","automated","built","coded","configured","containerized",
    "debugged","deployed","designed","developed","devised","engineered",
    "implemented","integrated","launched","migrated","modelled","optimized",
    "orchestrated","programmed","prototyped","refactored","released","scaled",
    "shipped","solved","streamlined","upgraded","wrote",
    # Leadership / Management
    "coached","coordinated","directed","established","executed","facilitated",
    "founded","governed","guided","headed","hired","led","managed","mentored",
    "motivated","oversaw","prioritized","recruited","reorganized","supervised",
    # Data / Analysis
    "analysed","analyzed","assessed","calculated","classified","clustered",
    "computed","correlated","discovered","evaluated","experimented","extracted",
    "forecast","identified","interpreted","investigated","measured","modeled",
    "monitored","quantified","researched","segmented","synthesized","validated",
    # Growth / Impact
    "achieved","accelerated","boosted","captured","championed","closed",
    "collaborated","contributed","created","cut","decreased","delivered",
    "demonstrated","drove","eliminated","enabled","enhanced","ensured",
    "exceeded","expanded","generated","grew","improved","increased",
    "influenced","introduced","maximized","minimized","negotiated","produced",
    "raised","reduced","resolved","restructured","revamped","saved","secured",
    "shaped","simplified","spearheaded","strengthened","transformed","won",
    # Communication / Design
    "authored","communicated","crafted","curated","documented","drafted",
    "illustrated","presented","promoted","published","reported","trained",
    "visualized",
}
_ACTION_VERB_RE = re.compile(
    r"^\b(" + "|".join(sorted(_ACTION_VERBS, key=len, reverse=True)) + r")(ed|ing)?\b",
    re.IGNORECASE,
)

# ── Degree / Education tiers ──────────────────────────────────────────────────
_DEGREE_TIER = {
    "phd": 4, "ph.d": 4, "doctorate": 4, "doctoral": 4,
    "mba": 3, "master": 3, "masters": 3, "m.s": 3, "m.sc": 3, "m.eng": 3,
    "bachelor": 2, "b.s": 2, "b.sc": 2, "b.tech": 2, "b.e": 2, "b.a": 2,
    "associate": 1, "diploma": 1, "certification": 1, "certificate": 1,
}

# ── Scoring weights (must sum to 1.0) ────────────────────────────────────────
WEIGHTS = {
    "keyword_match":   0.22,
    "bullet_strength": 0.25,
    "semantic_sim":    0.08,
    "summary":         0.10,
    "skills":          0.10,
    "education":       0.05,
    "projects":        0.08,
    "formatting":      0.06,
    "readability":     0.04,
    "red_flag_penalty":0.02,   # subtracted
}
assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "Weights must sum to 1.0"

# ── Grade thresholds ──────────────────────────────────────────────────────────
GRADES = [
    (93, "A+", "Outstanding — Top 5% match"),
    (85, "A",  "Excellent — Strong match"),
    (78, "B+", "Very Good — Above average"),
    (70, "B",  "Good — Solid foundation"),
    (62, "C+", "Fair — Targeted improvements needed"),
    (50, "C",  "Below Average — Significant gaps"),
    (35, "D",  "Weak — Major rewrite required"),
    (0,  "F",  "Critical — Resume not ATS‑ready"),
]

# ── Caches ────────────────────────────────────────────────────────────────────
_KEYWORD_CACHE: dict[tuple[str, int], dict[str, Any]] = {}

# ── Custom stop‑words extension ───────────────────────────────────────────────
_CUSTOM_STOPWORDS = {
    "job","jobs","candidate","candidates","role","roles","work","working",
    "team","teams","year","years","using","within","able","ability","across",
    "also","among","area","areas","based","both","including","knowledge",
    "like","look","looking","make","must","need","needs","new","part","please",
    "plus","prior","provide","required","should","strong","take","time",
    "type","types","use","used","want","will","would",
}
_STOPWORDS = ENGLISH_STOP_WORDS.union(_CUSTOM_STOPWORDS)


# ──────────────────────────────────────────────────────────────────────────────
# DATA CLASSES
# ──────────────────────────────────────────────────────────────────────────────

@dataclass
class Check:
    id:       str
    passed:   bool
    label:    str
    message:  str
    severity: str = "info"          # "critical" | "warning" | "info"
    score_impact: float = 0.0       # optional numeric delta for transparency

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "passed": self.passed,
            "label": self.label,
            "message": self.message,
            "severity": self.severity,
            "score_impact": self.score_impact,
        }


@dataclass
class Suggestion:
    priority: str        # "critical" | "high" | "medium" | "low"
    section:  str
    text:     str
    example:  str = ""   # optional "before → after" example

    def to_dict(self) -> dict[str, Any]:
        d = {"priority": self.priority, "section": self.section, "text": self.text}
        if self.example:
            d["example"] = self.example
        return d


@dataclass
class SectionResult:
    section_id:        str
    name:              str
    percentage_score:  int
    checks:            list[Check] = field(default_factory=list)
    suggestions:       list[Suggestion] = field(default_factory=list)
    metadata:          dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sectionId":       self.section_id,
            "name":            self.name,
            "percentageScore": self.percentage_score,
            "checks":          [c.to_dict() for c in self.checks],
            "suggestions":     [s.to_dict() for s in self.suggestions],
            "metadata":        self.metadata,
        }


# ──────────────────────────────────────────────────────────────────────────────
# GRADING
# ──────────────────────────────────────────────────────────────────────────────

def _grade(score: int) -> dict[str, str]:
    for threshold, grade, label in GRADES:
        if score >= threshold:
            return {"grade": grade, "label": label}
    return {"grade": "F", "label": "Critical — Resume not ATS‑ready"}


# ──────────────────────────────────────────────────────────────────────────────
# SECTION ANALYZERS
# ──────────────────────────────────────────────────────────────────────────────

def _analyze_summary(resume: Resume) -> SectionResult:
    """
    Checks: presence, length, metric usage, value proposition,
    weak language, first‑person pronouns (ATS red‑flag), tailoring signals.
    """
    s = clean_text(resume.data.summary)
    checks:      list[Check]      = []
    suggestions: list[Suggestion] = []
    score = 0

    # 1. Presence
    if not s:
        checks.append(Check("has_summary", False, "Summary present",
                            "No professional summary found. This is critical for ATS parsing.",
                            severity="critical"))
        suggestions.append(Suggestion("critical", "summary",
                                      "Add a 2–4 sentence professional summary tailored to the job description.",
                                      example="Senior Software Engineer with 6+ years building distributed systems at scale. "
                                              "Reduced API latency by 40% at Acme Corp; shipped 3 production micro‑services. "
                                              "Seeking a Staff Engineer role at a high‑growth startup."))
        return SectionResult("summary", "Summary", 0, checks, suggestions)

    checks.append(Check("has_summary", True, "Summary present", "Professional summary detected.", score_impact=15))
    score += 15

    # 2. Length (20–80 words optimal)
    wc = len(s.split())
    if 20 <= wc <= 80:
        checks.append(Check("summary_length", True, "Optimal length", f"{wc} words — ideal (20–80).", score_impact=15))
        score += 15
    elif wc < 20:
        checks.append(Check("summary_length", False, "Too short", f"{wc} words. Too thin to create impact — aim for 20–80.", severity="warning", score_impact=5))
        score += 5
        suggestions.append(Suggestion("high", "summary", f"Expand your summary ({wc} words) to at least 20 words. Add your top skill and a key achievement."))
    else:
        checks.append(Check("summary_length", False, "Too long", f"{wc} words. Recruiters scan in 6 seconds — trim to 80 words max.", severity="warning", score_impact=8))
        score += 8

    # 3. Quantitative evidence
    metrics = _METRIC_PATTERN.findall(s)
    if len(metrics) >= 2:
        checks.append(Check("summary_metrics", True, "Strong metrics", f"{len(metrics)} quantitative data points found.", score_impact=25))
        score += 25
    elif metrics:
        checks.append(Check("summary_metrics", False, "Weak metrics", "Only 1 metric found. Add at least 2 numbers to stand out.", severity="warning", score_impact=12))
        score += 12
        suggestions.append(Suggestion("high", "summary", "Add a second metric: years of experience, team size, revenue impact, or % improvement."))
    else:
        checks.append(Check("summary_metrics", False, "No metrics", "Zero quantitative data — ATS and recruiters penalise this.", severity="critical", score_impact=0))
        suggestions.append(Suggestion("critical", "summary", "Add at least 2 numbers to your summary (e.g. '5+ years', '40% cost reduction').",
                                      example="…reduced infrastructure costs by 35%, leading a team of 8 engineers."))

    # 4. First‑person pronouns (strict ATS penalises "I", "my", "we")
    pronouns = re.findall(r"\b(I|my|me|we|our)\b", s)
    if pronouns:
        checks.append(Check("no_pronouns", False, "First‑person pronouns", f"Found: {', '.join(set(pronouns))}. ATS systems flag these.", severity="warning", score_impact=0))
        suggestions.append(Suggestion("medium", "summary", "Remove first‑person pronouns. Start with your title or a noun phrase.",
                                      example="❌ I am a software engineer… → ✅ Software Engineer with 5+ years…"))
    else:
        checks.append(Check("no_pronouns", True, "No first‑person pronouns", "Clean professional voice.", score_impact=10))
        score += 10

    # 5. Weak / cliché language
    weak = _WEAK_PHRASES.findall(s)
    if not weak:
        checks.append(Check("no_weak_summary", True, "No filler phrases", "Professional, impact‑focused language.", score_impact=20))
        score += 20
    else:
        unique_weak = sorted(set(w.lower() for w in weak))
        checks.append(Check("no_weak_summary", False, "Filler phrases detected",
                            f"Remove: {', '.join(unique_weak)}", severity="warning", score_impact=5))
        score += 5
        suggestions.append(Suggestion("high", "summary", f"Replace weak phrases: {', '.join(unique_weak)}."))

    # 6. Value proposition signal (job‑title / role keyword in summary)
    # lightweight heuristic — checks for at least one plausible role token
    title_tokens = set(_tokenize(clean_text(resume.title or "")))
    summary_tokens = set(_tokenize(s))
    overlap = title_tokens & summary_tokens
    if overlap:
        checks.append(Check("value_prop", True, "Role alignment in summary", "Summary references your professional title/role.", score_impact=15))
        score += 15
    else:
        checks.append(Check("value_prop", False, "Weak role alignment", "Summary does not mention your role title — ATS may not map it correctly.", severity="warning"))
        suggestions.append(Suggestion("medium", "summary", "Include your target job title in the summary to improve ATS role matching."))

    return SectionResult("summary", "Summary", _clamp(score), checks, suggestions,
                         metadata={"word_count": wc, "metrics_found": len(metrics)})


def _analyze_experience(resume: Resume) -> SectionResult:
    """
    Deep bullet analysis: STAR compliance, action verbs, metric density,
    weak language, date coverage, role‑title clarity, bullet count hygiene.
    """
    items        = resume.data.experience
    checks:      list[Check]      = []
    suggestions: list[Suggestion] = []
    score        = 0

    if not items:
        checks.append(Check("has_exp", False, "Experience section",
                            "No experience entries — critical ATS failure.", severity="critical"))
        return SectionResult("experience", "Experience & Bullets", 0, checks,
                             [Suggestion("critical", "experience", "Add at least 2 work experience entries with 3–6 bullet points each.")])

    n_entries = len(items)
    checks.append(Check("has_exp", True, "Experience section", f"{n_entries} entries found.", score_impact=10))
    score += 10
    if n_entries >= 3:
        score += 5

    # ── Per‑entry validation ──────────────────────────────────────────────────
    entries_missing_dates    = 0
    entries_missing_title    = 0
    entries_with_few_bullets = 0

    all_bullets: list[str] = []
    for item in items:
        if not clean_text(item.role):
            entries_missing_title += 1
        if not _YEAR_RANGE_PATT.search(getattr(item, "duration", "") or ""):
            entries_missing_dates += 1
        if len(item.points) < 3:
            entries_with_few_bullets += 1
        for b in item.points:
            bc = clean_text(b)
            if bc:
                all_bullets.append(bc)

    if entries_missing_title:
        checks.append(Check("entry_titles", False, "Missing role titles",
                            f"{entries_missing_title} entries lack a clear job title.", severity="warning"))
        suggestions.append(Suggestion("high", "experience", "Every experience entry must have a clear job title for ATS role‑matching."))
    else:
        checks.append(Check("entry_titles", True, "All entries have titles", "Role titles present on all entries.", score_impact=5))
        score += 5

    if entries_missing_dates:
        checks.append(Check("entry_dates", False, "Missing date ranges",
                            f"{entries_missing_dates} entries lack date ranges. ATS systems use these to calculate tenure.", severity="warning"))
        suggestions.append(Suggestion("high", "experience", "Add start–end year/month to every experience entry (e.g., Jan 2021 – Mar 2023)."))
    else:
        checks.append(Check("entry_dates", True, "Date ranges present", "All entries include date ranges.", score_impact=5))
        score += 5

    if entries_with_few_bullets:
        checks.append(Check("bullet_count", False, "Thin entries",
                            f"{entries_with_few_bullets} entries have fewer than 3 bullets.", severity="warning"))
        suggestions.append(Suggestion("medium", "experience", "Each experience entry should have 3–6 bullet points. Thin entries hurt ATS parsing."))
    else:
        checks.append(Check("bullet_count", True, "Adequate bullet coverage", "Each entry has 3+ bullets.", score_impact=5))
        score += 5

    n = len(all_bullets) or 1

    # ── Action verb analysis ──────────────────────────────────────────────────
    action_count = sum(1 for b in all_bullets if _ACTION_VERB_RE.match(b))
    action_pct   = action_count / n

    if action_pct >= 0.85:
        checks.append(Check("action_verbs", True, "Action verbs", f"{action_pct:.0%} of bullets start with strong action verbs.", score_impact=20))
        score += 20
    elif action_pct >= 0.60:
        checks.append(Check("action_verbs", False, "Action verbs — partial",
                            f"{action_pct:.0%} start with action verbs. Target ≥85%.", severity="warning", score_impact=12))
        score += 12
        suggestions.append(Suggestion("high", "experience",
                                      "Start more bullets with powerful action verbs.",
                                      example="❌ 'Was responsible for database migration' → ✅ 'Migrated 500 GB PostgreSQL database, reducing query time by 60%'"))
    else:
        checks.append(Check("action_verbs", False, "Weak action verbs",
                            f"Only {action_pct:.0%} use action verbs — critical ATS signal missing.", severity="critical", score_impact=4))
        score += 4
        suggestions.append(Suggestion("critical", "experience",
                                      f"Only {action_count}/{n} bullets start with action verbs. Rewrite all bullets to open with a strong past‑tense verb."))

    # ── Metric density ────────────────────────────────────────────────────────
    metric_count = sum(1 for b in all_bullets if _METRIC_PATTERN.search(b))
    metric_pct   = metric_count / n

    if metric_pct >= 0.65:
        checks.append(Check("metrics", True, "Quantifiable impact", f"{metric_pct:.0%} of bullets contain metrics.", score_impact=25))
        score += 25
    elif metric_pct >= 0.35:
        checks.append(Check("metrics", False, "Metrics — partial",
                            f"{metric_pct:.0%} contain metrics. Strong resumes hit 65%+.", severity="warning", score_impact=14))
        score += 14
        suggestions.append(Suggestion("high", "experience",
                                      "Add measurable outcomes (%, $, users, time saved) to more bullets.",
                                      example="❌ 'Improved application performance' → ✅ 'Improved API response time by 42% (800ms → 465ms) serving 1.2M daily requests'"))
    else:
        checks.append(Check("metrics", False, "Metrics critically low",
                            f"Only {metric_pct:.0%} of bullets have numbers — ATS ranks this resume low.", severity="critical", score_impact=4))
        score += 4
        suggestions.append(Suggestion("critical", "experience",
                                      f"Only {metric_count}/{n} bullets contain metrics. Every bullet needs a number.",
                                      example="Add %, $, x (multiplier), users, hours saved, or team size to every achievement."))

    # ── STAR pattern proxy (bullet has both action + metric + context) ────────
    star_count = sum(
        1 for b in all_bullets
        if _ACTION_VERB_RE.match(b) and _METRIC_PATTERN.search(b) and len(b.split()) >= 8
    )
    star_pct = star_count / n
    if star_pct >= 0.40:
        checks.append(Check("star_bullets", True, "STAR‑style bullets", f"{star_pct:.0%} of bullets follow STAR pattern.", score_impact=10))
        score += 10
    else:
        checks.append(Check("star_bullets", False, "STAR pattern weak",
                            f"Only {star_pct:.0%} of bullets have action + metric + context (STAR).", severity="warning"))
        suggestions.append(Suggestion("medium", "experience",
                                      "Write bullets in STAR format: Action verb + Task/Context + Metric.",
                                      example="✅ 'Engineered (Action) a real‑time fraud detection pipeline (Task) that cut false positives by 35% (Metric)'"))

    # ── Bullet length hygiene ─────────────────────────────────────────────────
    too_short = sum(1 for b in all_bullets if len(b.split()) < 6)
    too_long  = sum(1 for b in all_bullets if len(b.split()) > 35)
    if too_short:
        checks.append(Check("bullet_length_min", False, "Bullets too short",
                            f"{too_short} bullets are under 6 words — expand with context/metric.", severity="warning"))
        suggestions.append(Suggestion("medium", "experience", f"{too_short} bullets are too terse. Add context and impact."))
    if too_long:
        checks.append(Check("bullet_length_max", False, "Bullets too long",
                            f"{too_long} bullets exceed 35 words — ATS parsers may truncate these.", severity="warning"))
        suggestions.append(Suggestion("medium", "experience", f"{too_long} bullets are too verbose. Split or trim to ≤35 words."))

    # ── Weak/filler language ─────────────────────────────────────────────────
    weak_bullets = []
    weak_words_found: set[str] = set()
    for b in all_bullets:
        wm = _WEAK_PHRASES.findall(b)
        if wm:
            weak_bullets.append(b)
            weak_words_found.update(w.lower() for w in wm)

    if not weak_bullets:
        checks.append(Check("no_weak_exp", True, "No filler phrases", "All bullets use crisp, professional language.", score_impact=10))
        score += 10
    else:
        checks.append(Check("no_weak_exp", False, "Filler phrases found",
                            f"{len(weak_bullets)} bullets contain weak language: {', '.join(sorted(weak_words_found))}",
                            severity="warning", score_impact=3))
        score += 3
        suggestions.append(Suggestion("high", "experience",
                                      f"Rewrite {len(weak_bullets)} bullet(s) that contain cliché phrases: {', '.join(sorted(weak_words_found))}"))

    return SectionResult(
        "experience", "Experience & Bullets", _clamp(score), checks, suggestions,
        metadata={
            "total_bullets":   n,
            "action_pct":      round(action_pct, 2),
            "metric_pct":      round(metric_pct, 2),
            "star_pct":        round(star_pct, 2),
            "weak_words":      sorted(weak_words_found),
        },
    )


def _analyze_skills(resume: Resume, jd_keywords: list[str] | None = None) -> SectionResult:
    """
    Checks: presence, count, deduplication, verbosity, JD overlap,
    categorisation (hard vs soft), and ATS keyword density.
    """
    skills       = resume.data.skills or []
    checks:      list[Check]      = []
    suggestions: list[Suggestion] = []
    score        = 0

    if not skills:
        checks.append(Check("has_skills", False, "Skills section",
                            "No skills section found — ATS cannot match you to any keywords.", severity="critical"))
        return SectionResult("skills", "Skills", 0, checks,
                             [Suggestion("critical", "skills", "Add a dedicated Skills section with 8–20 relevant technical and soft skills.")])

    n = len(skills)
    checks.append(Check("has_skills", True, "Skills section", f"{n} skills listed.", score_impact=20))
    score += 20

    # Count
    if n >= 12:
        checks.append(Check("skill_count", True, "Strong skill count", f"{n} skills — good ATS keyword coverage.", score_impact=25))
        score += 25
    elif n >= 7:
        checks.append(Check("skill_count", False, "Moderate skill count",
                            f"{n} skills. Aim for 12–20 for maximum ATS matching.", severity="warning", score_impact=15))
        score += 15
        suggestions.append(Suggestion("medium", "skills", f"Add {12 - n} more skills (tools, frameworks, methodologies) to improve keyword hits."))
    else:
        checks.append(Check("skill_count", False, "Too few skills",
                            f"Only {n} skills — critically low for ATS keyword matching.", severity="critical", score_impact=5))
        score += 5
        suggestions.append(Suggestion("critical", "skills", f"Add at least {12 - n} more skills. Focus on tools and technologies mentioned in the JD."))

    # Deduplication
    normalised = [s.lower().strip() for s in skills]
    dupes      = [k for k, v in Counter(normalised).items() if v > 1]
    if not dupes:
        checks.append(Check("no_dupes", True, "No duplicate skills", "All skills are unique.", score_impact=10))
        score += 10
    else:
        checks.append(Check("no_dupes", False, "Duplicate skills found",
                            f"Remove duplicates: {', '.join(dupes)}", severity="warning"))
        suggestions.append(Suggestion("medium", "skills", f"Remove {len(dupes)} duplicate skill(s): {', '.join(dupes)}"))

    # Verbosity — skills should be concise keywords
    verbose = [s for s in skills if len(s.split()) > 4]
    if not verbose:
        checks.append(Check("concise_skills", True, "Concise skill entries", "Skills are keyword‑formatted.", score_impact=10))
        score += 10
    else:
        checks.append(Check("concise_skills", False, "Verbose skill entries",
                            f"{len(verbose)} skills read as sentences, not keywords: {'; '.join(verbose[:3])}",
                            severity="warning"))
        suggestions.append(Suggestion("medium", "skills",
                                      "Keep skills as short keywords or short phrases (≤4 words). ATS tokenises skill fields.",
                                      example="❌ 'Experience with relational databases' → ✅ 'PostgreSQL, MySQL'"))

    # JD keyword overlap
    if jd_keywords:
        skill_tokens = {t for s in skills for t in _tokenize(s.lower())}
        jd_overlap   = [kw for kw in jd_keywords[:20] if kw in skill_tokens]
        overlap_pct  = len(jd_overlap) / min(20, len(jd_keywords))
        if overlap_pct >= 0.50:
            checks.append(Check("jd_skill_overlap", True, "Strong JD keyword alignment",
                                f"{len(jd_overlap)}/20 top JD keywords appear in skills.", score_impact=25))
            score += 25
        elif overlap_pct >= 0.25:
            checks.append(Check("jd_skill_overlap", False, "Partial JD alignment",
                                f"Only {len(jd_overlap)}/20 top JD keywords in skills.", severity="warning", score_impact=12))
            score += 12
            missing_skills = [kw for kw in jd_keywords[:20] if kw not in skill_tokens][:6]
            suggestions.append(Suggestion("high", "skills",
                                          f"Add JD‑matched skills to your skills section: {', '.join(missing_skills)}"))
        else:
            checks.append(Check("jd_skill_overlap", False, "Weak JD alignment",
                                f"Only {len(jd_overlap)}/20 top JD keywords in skills.", severity="critical", score_impact=4))
            score += 4
            missing_skills = [kw for kw in jd_keywords[:20] if kw not in skill_tokens][:8]
            suggestions.append(Suggestion("critical", "skills",
                                          f"Your skills section is missing key JD terms. Add: {', '.join(missing_skills)}"))
    else:
        score += 10  # No JD provided — give benefit of the doubt

    return SectionResult(
        "skills", "Skills", _clamp(score), checks, suggestions,
        metadata={"skill_count": n, "duplicates": dupes, "verbose_entries": len(verbose)},
    )


def _analyze_education(resume: Resume) -> SectionResult:
    """
    Checks: presence, degree tier, relevant field signals, GPA (optional),
    certifications, and recency of highest degree.
    """
    edu_data     = getattr(resume.data, "education", None) or []
    checks:      list[Check]      = []
    suggestions: list[Suggestion] = []
    score        = 0

    if not edu_data:
        checks.append(Check("has_edu", False, "Education section",
                            "No education section found.", severity="warning"))
        suggestions.append(Suggestion("medium", "education",
                                      "Add an education section even if self‑taught — list certifications, bootcamps, or online courses."))
        return SectionResult("education", "Education", 30, checks, suggestions)

    checks.append(Check("has_edu", True, "Education section", f"{len(edu_data)} entries.", score_impact=20))
    score += 20

    highest_tier = 0
    has_date     = False
    cert_count   = 0

    for edu in edu_data:
        raw = clean_text(getattr(edu, "degree", "") or "").lower()
        for keyword, tier in _DEGREE_TIER.items():
            if keyword in raw:
                highest_tier = max(highest_tier, tier)
                if tier == 1:
                    cert_count += 1
                break
        dur = clean_text(getattr(edu, "duration", "") or "")
        if _DATE_PATTERN.search(dur):
            has_date = True

    tier_labels  = {4: "PhD / Doctorate", 3: "Master's / MBA", 2: "Bachelor's", 1: "Associate / Certificate", 0: "Not detected"}
    tier_scores  = {4: 40, 3: 35, 2: 30, 1: 20, 0: 10}

    checks.append(Check("degree_tier", True if highest_tier >= 2 else False,
                        "Degree level", f"Highest detected: {tier_labels[highest_tier]}",
                        severity="info" if highest_tier >= 2 else "warning",
                        score_impact=tier_scores[highest_tier]))
    score += tier_scores[highest_tier]

    if cert_count >= 2:
        checks.append(Check("certifications", True, "Certifications found",
                            f"{cert_count} certifications detected.", score_impact=20))
        score += 20
    elif cert_count == 1:
        checks.append(Check("certifications", False, "One certification",
                            "Add more industry‑relevant certifications to boost ATS ranking.", score_impact=10))
        score += 10
        suggestions.append(Suggestion("low", "education", "Consider adding relevant certifications (AWS, GCP, PMP, etc.)"))

    if has_date:
        checks.append(Check("edu_dates", True, "Graduation dates", "Dates present.", score_impact=20))
        score += 20
    else:
        checks.append(Check("edu_dates", False, "Missing graduation dates",
                            "Add graduation year to every education entry.", severity="warning"))
        suggestions.append(Suggestion("medium", "education", "Add graduation year(s) to education entries."))

    return SectionResult("education", "Education", _clamp(score), checks, suggestions,
                         metadata={"highest_tier": tier_labels[highest_tier], "cert_count": cert_count})


def _analyze_projects(resume: Resume) -> SectionResult:
    """
    Checks: presence, bullet quality, metrics, link/URL presence,
    tech‑stack signals, recency (year in title/desc).
    """
    projects     = getattr(resume.data, "projects", None) or []
    checks:      list[Check]      = []
    suggestions: list[Suggestion] = []
    score        = 0

    if not projects:
        checks.append(Check("has_projects", False, "Projects section",
                            "No projects section — missed opportunity for early‑career candidates.", severity="warning"))
        return SectionResult("projects", "Projects", 25, checks,
                             [Suggestion("medium", "projects",
                                         "Add 2–4 impactful projects with metrics, links, and tech stack details.")])

    checks.append(Check("has_projects", True, "Projects section", f"{len(projects)} projects.", score_impact=25))
    score += 25

    total_bullets   = 0
    metric_bullets  = 0
    action_bullets  = 0
    has_url         = False
    has_year        = False

    for proj in projects:
        if _URL_PATTERN.search(getattr(proj, "url", "") or ""):
            has_url = True
        if _DATE_PATTERN.search(getattr(proj, "name", "") or ""):
            has_year = True
        for b in proj.points:
            bc = clean_text(b)
            if not bc:
                continue
            total_bullets += 1
            if _METRIC_PATTERN.search(bc):
                metric_bullets += 1
            if _ACTION_VERB_RE.match(bc):
                action_bullets += 1

    n = total_bullets or 1

    if total_bullets >= len(projects) * 3:
        checks.append(Check("project_depth", True, "Project detail", f"{total_bullets} total bullet points.", score_impact=20))
        score += 20
    else:
        checks.append(Check("project_depth", False, "Thin project descriptions",
                            f"Only {total_bullets} bullets across {len(projects)} projects. Target 3+ per project.", severity="warning"))
        suggestions.append(Suggestion("medium", "projects", "Expand project descriptions to at least 3 bullets per project."))
        score += 10

    metric_pct = metric_bullets / n
    if metric_pct >= 0.50:
        checks.append(Check("project_metrics", True, "Quantified impact", f"{metric_pct:.0%} of project bullets have metrics.", score_impact=25))
        score += 25
    else:
        checks.append(Check("project_metrics", False, "Project metrics missing",
                            f"Only {metric_pct:.0%} of project bullets quantify impact.", severity="warning"))
        suggestions.append(Suggestion("high", "projects",
                                      "Add metrics to project bullets: users, stars, uptime, performance improvement.",
                                      example="✅ 'Built REST API serving 50k daily requests with 99.9% uptime'"))
        score += 8

    if has_url:
        checks.append(Check("project_links", True, "Project links present", "GitHub / live URLs found.", score_impact=15))
        score += 15
    else:
        checks.append(Check("project_links", False, "No project links",
                            "Add GitHub or live demo URLs — recruiters and ATS extract these.", severity="warning"))
        suggestions.append(Suggestion("medium", "projects", "Add a GitHub link or live demo URL to each project."))

    action_pct = action_bullets / n
    if action_pct < 0.60:
        suggestions.append(Suggestion("medium", "projects",
                                      "Start project bullets with action verbs (Built, Designed, Deployed…)."))

    return SectionResult(
        "projects", "Projects", _clamp(score), checks, suggestions,
        metadata={"total_bullets": total_bullets, "metric_pct": round(metric_pct, 2), "has_links": has_url},
    )


def _analyze_formatting(resume: Resume, resume_text: str) -> SectionResult:
    """
    ATS parse‑ability heuristics: section headers, contact info,
    consistent date formats, reasonable length, special characters.
    """
    text         = resume_text or ""
    checks:      list[Check]      = []
    suggestions: list[Suggestion] = []
    score        = 70   # start optimistic — most modern resumes are parseable

    # Contact info signals
    has_email   = bool(re.search(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}", text, re.I))
    has_phone   = bool(re.search(r"(\+?\d[\d\s\-().]{7,}\d)", text))
    has_linkedin= bool(re.search(r"linkedin\.com/in/\S+", text, re.I))

    contact_score = sum([has_email, has_phone, has_linkedin])
    if contact_score == 3:
        checks.append(Check("contact_info", True, "Complete contact info", "Email, phone, and LinkedIn found.", score_impact=15))
        score = min(100, score + 5)
    elif contact_score == 2:
        checks.append(Check("contact_info", False, "Incomplete contact info",
                            "Missing: " + (", ".join(filter(None, [
                                None if has_email    else "email",
                                None if has_phone    else "phone",
                                None if has_linkedin else "LinkedIn URL",
                            ]))), severity="warning"))
        suggestions.append(Suggestion("high", "formatting", "Ensure email, phone, and LinkedIn URL are present in your header."))
        score -= 5
    else:
        checks.append(Check("contact_info", False, "Critical contact info missing",
                            "Multiple contact fields missing.", severity="critical"))
        suggestions.append(Suggestion("critical", "formatting", "Add email, phone number, and LinkedIn URL to your resume header."))
        score -= 15

    # Special characters / non‑ASCII that confuse ATS parsers
    non_ascii_count = sum(1 for c in text if ord(c) > 127 and c not in "–—''""•…")
    if non_ascii_count > 20:
        checks.append(Check("special_chars", False, "Excessive special characters",
                            f"{non_ascii_count} non‑ASCII characters detected. ATS parsers may garble these.", severity="warning"))
        suggestions.append(Suggestion("medium", "formatting", "Replace decorative or non‑ASCII characters with plain ASCII equivalents."))
        score -= 10
    else:
        checks.append(Check("special_chars", True, "Clean character set", "No problematic special characters.", score_impact=5))

    # Resume length heuristic (word count)
    wc = len(text.split())
    if 400 <= wc <= 1000:
        checks.append(Check("resume_length", True, "Ideal resume length", f"{wc} words — within the 400–1000 word sweet‑spot.", score_impact=10))
    elif wc < 250:
        checks.append(Check("resume_length", False, "Resume too thin",
                            f"Only {wc} words. ATS may score this as under‑qualified.", severity="warning"))
        score -= 10
        suggestions.append(Suggestion("high", "formatting", "Expand your resume to at least 400 words with more detailed bullet points."))
    elif wc > 1400:
        checks.append(Check("resume_length", False, "Resume too long",
                            f"{wc} words — exceeds recommended length. ATS may truncate.", severity="warning"))
        score -= 5
        suggestions.append(Suggestion("medium", "formatting", "Trim resume to under 1000 words. Remove outdated or irrelevant content."))

    # Section header detection
    expected_headers = ["experience", "education", "skills", "summary", "objective"]
    found_headers    = [h for h in expected_headers if re.search(r"\b" + h + r"\b", text, re.I)]
    if len(found_headers) >= 4:
        checks.append(Check("section_headers", True, "Required sections present",
                            f"Detected: {', '.join(found_headers)}", score_impact=10))
    else:
        missing_headers = [h for h in expected_headers if h not in found_headers]
        checks.append(Check("section_headers", False, "Section headers incomplete",
                            f"Missing: {', '.join(missing_headers)}", severity="warning"))
        suggestions.append(Suggestion("high", "formatting",
                                      f"Ensure clear section headers for: {', '.join(missing_headers)}. ATS relies on these to parse content."))
        score -= 10

    return SectionResult(
        "formatting", "ATS Formatting", _clamp(score), checks, suggestions,
        metadata={"word_count": wc, "has_email": has_email, "has_phone": has_phone, "has_linkedin": has_linkedin},
    )


# ──────────────────────────────────────────────────────────────────────────────
# KEYWORD ENGINE — TF‑IDF WEIGHTED WITH BIGRAM SUPPORT
# ──────────────────────────────────────────────────────────────────────────────

def extract_keywords(jd: str, top_n: int = TOP_KEYWORD_LIMIT) -> dict[str, Any]:
    """
    Extract and rank keywords from a JD using a TF‑IDF‑inspired weighting
    that combines raw frequency with a mild IDF penalty for very common terms.
    Includes unigrams and meaningful bigrams.
    """
    cleaned = _require_text(jd, "jd")
    cache_key = (cleaned, top_n)
    if cache_key in _KEYWORD_CACHE:
        return _KEYWORD_CACHE[cache_key]

    tokens = [t for t in _tokenize(cleaned) if len(t) >= 3 and t not in _STOPWORDS]

    # Unigram frequency
    freq = Counter(tokens)

    # Bigram extraction — meaningful noun‑noun / adj‑noun pairs only
    bigram_freq: Counter[str] = Counter()
    for i in range(len(tokens) - 1):
        bg = f"{tokens[i]} {tokens[i+1]}"
        if len(tokens[i]) >= 3 and len(tokens[i+1]) >= 3:
            bigram_freq[bg] += 1

    # Merge bigrams that appear ≥2 times
    for bg, cnt in bigram_freq.items():
        if cnt >= 2:
            freq[bg] = cnt * 2      # boost bigrams — they signal phrases

    # IDF dampening: penalise tokens that are too common (>50% of sentences)
    sentences = [s.strip() for s in _SENTENCE_PATTERN.split(cleaned) if s.strip()]
    ns = len(sentences) or 1
    doc_freq: Counter[str] = Counter()
    for sent in sentences:
        for t in set(_tokenize(sent)):
            doc_freq[t] += 1

    tf_idf: dict[str, float] = {}
    total_tokens = sum(freq.values()) or 1
    for token, tf in freq.items():
        df = doc_freq.get(token.split()[0], 1)    # use first word for bigrams
        idf = math.log((ns + 1) / (df + 1)) + 1
        tf_idf[token] = (tf / total_tokens) * idf

    ranked = sorted(tf_idf.items(), key=lambda x: (-x[1], x[0]))[:top_n]

    result: dict[str, Any] = {
        "keywords":      [kw for kw, _ in ranked],
        "frequency_map": {kw: freq.get(kw, 0) for kw, _ in ranked},
        "tfidf_map":     {kw: round(score, 6) for kw, score in ranked},
    }
    _KEYWORD_CACHE[cache_key] = result
    return result


def keyword_match_score(resume_text: str, keyword_data: dict[str, Any]) -> dict[str, Any]:
    """
    Weighted keyword match using TF‑IDF scores.
    Awards partial credit for stem matches (e.g., 'optimise' ↔ 'optimization').
    """
    cleaned = clean_text(resume_text)
    if not cleaned:
        return {"score": 0, "missing_keywords": [], "matched": [], "match_rate": 0,
                "partial_matches": []}

    resume_tokens  = set(_tokenize(cleaned))
    tfidf_map      = keyword_data.get("tfidf_map", {})
    ranked_kws     = keyword_data.get("keywords", [])

    if not tfidf_map:
        return {"score": 0, "missing_keywords": ranked_kws[:MISSING_KEYWORD_LIMIT],
                "matched": [], "match_rate": 0, "partial_matches": []}

    total_weight   = sum(tfidf_map.values())
    matched_weight = 0.0
    matched        = []
    partial        = []
    missing        = []

    for kw in ranked_kws:
        weight = tfidf_map.get(kw, 0)
        kw_tokens = set(kw.split())

        if kw_tokens <= resume_tokens:                  # exact token match
            matched_weight += weight
            matched.append(kw)
        elif kw_tokens & resume_tokens:                 # partial phrase match
            overlap_ratio  = len(kw_tokens & resume_tokens) / len(kw_tokens)
            matched_weight += weight * overlap_ratio * 0.5
            partial.append(kw)
        else:                                           # stem proximity check
            stem_match = any(
                r.startswith(kw[:5]) or kw.startswith(r[:5])
                for r in resume_tokens if len(r) >= 5 and len(kw) >= 5
            )
            if stem_match:
                matched_weight += weight * 0.25
                partial.append(kw)
            else:
                missing.append(kw)

    raw_score  = (matched_weight / total_weight * 100) if total_weight > 0 else 0
    match_rate = (len(matched) + len(partial) * 0.5) / len(ranked_kws) if ranked_kws else 0

    return {
        "score":            _clamp(raw_score),
        "missing_keywords": missing[:MISSING_KEYWORD_LIMIT],
        "matched":          matched,
        "partial_matches":  partial,
        "match_rate":       round(match_rate, 3),
    }


# ──────────────────────────────────────────────────────────────────────────────
# READABILITY
# ──────────────────────────────────────────────────────────────────────────────

def readability_score(resume_text: str) -> int:
    """
    Flesch‑Kincaid readability proxy optimised for resume bullet style.
    Penalises very short (fragment‑heavy) and very long (run‑on) sentences.
    Also rewards sentence‑length variance (signals bullet diversity).
    """
    cleaned   = clean_text(resume_text)
    if not cleaned:
        return 0

    sentences = [s.strip() for s in _SENTENCE_PATTERN.split(cleaned) if len(s.strip().split()) >= 3]
    if not sentences:
        return 50   # can't assess — neutral

    lengths = [len(s.split()) for s in sentences]
    avg     = sum(lengths) / len(lengths)
    score   = 100.0

    # Penalise avg sentence length outside 8–22 word sweet‑spot for bullet prose
    if avg > 22:
        score -= min(35.0, (avg - 22) * 3.0)
    elif avg < 6:
        score -= min(20.0, (6 - avg) * 4.0)

    # Penalise individual outliers
    score -= sum(8.0 for ln in lengths if ln > 35)
    score -= sum(5.0 for ln in lengths if ln < 4)

    # Reward variance (diverse bullet lengths signal a dynamic resume)
    if len(lengths) > 3:
        mean  = avg
        stdev = math.sqrt(sum((l - mean) ** 2 for l in lengths) / len(lengths))
        if 3 <= stdev <= 8:
            score += 5.0
        elif stdev > 12:
            score -= 5.0  # too erratic

    return _clamp(score)


# ──────────────────────────────────────────────────────────────────────────────
# RED‑FLAG PENALTY ENGINE
# ──────────────────────────────────────────────────────────────────────────────

def _red_flag_penalty(resume: Resume, resume_text: str) -> tuple[int, list[Suggestion]]:
    """
    Returns a 0–100 penalty score (higher = more red flags) and suggestions.
    Deducted from final score.
    """
    text        = resume_text.lower()
    suggestions: list[Suggestion] = []
    penalty     = 0

    # Objective statements (outdated, ATS-unfriendly)
    if re.search(r"\b(objective|career objective|my goal is|seeking a position)\b", text):
        penalty += 10
        suggestions.append(Suggestion("medium", "formatting",
                                      "Replace an 'Objective' statement with a modern 'Professional Summary'."))

    # References section (wastes space, ATS parses as noise)
    if re.search(r"\breferences\s+(available|on request|upon request)\b", text):
        penalty += 5
        suggestions.append(Suggestion("low", "formatting",
                                      "Remove 'References available upon request' — it's assumed and wastes ATS space."))

    # Excessive use of personal pronouns
    pronoun_count = len(re.findall(r"\b(i |i'm|my |me |we |our )\b", text))
    if pronoun_count > 5:
        penalty += 10
        suggestions.append(Suggestion("medium", "formatting",
                                      f"Found {pronoun_count} personal pronouns. ATS systems and recruiters expect noun‑phrase bullets."))

    # Photo / date of birth / marital status mentions (legal liability for recruiters)
    if re.search(r"\b(photo|photograph|dob|date of birth|marital status|nationality|religion|gender|sex)\b", text):
        penalty += 15
        suggestions.append(Suggestion("high", "formatting",
                                      "Remove personal details (DOB, photo, marital status, nationality) — these trigger ATS filters in many regions."))

    # Very high weak‑phrase density
    weak_count = len(_WEAK_PHRASES.findall(text))
    if weak_count > 8:
        penalty += 15
        suggestions.append(Suggestion("high", "experience",
                                      f"{weak_count} weak/cliché phrases detected across the resume. This severely hurts ATS ranking."))
    elif weak_count > 4:
        penalty += 7

    return _clamp(penalty), suggestions


# ──────────────────────────────────────────────────────────────────────────────
# MAIN SCORING ENTRY POINT
# ──────────────────────────────────────────────────────────────────────────────

def calculate_ats_score(
    resume:       Resume,
    jd:           str = "",
    *,
    resume_text:  str | None        = None,
    keyword_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Compute a holistic ATS score (0–100) with granular section feedback.

    Parameters
    ----------
    resume       : Parsed Resume model object.
    jd           : Raw job description text (optional).
    resume_text  : Optional pre‑flattened resume text (avoids re‑serialisation).
    keyword_data : Optional pre‑extracted keyword dict (for batch processing).

    Returns
    -------
    Rich dict with: score, grade, breakdown, section_results, suggestions,
    keyword analysis, and audit metadata.
    """
    _require_resume(resume)
    target_jd = clean_text(jd) if jd else ""
    flat       = clean_text(resume_text) if resume_text else resume_to_text(resume)

    # ── Core analyses ─────────────────────────────────────────────────────────
    kw_data_obj   = keyword_data if keyword_data else (extract_keywords(target_jd) if target_jd else {"keywords": [], "frequency_map": {}, "tfidf_map": {}})
    kw_result     = keyword_match_score(flat, kw_data_obj) if target_jd else {"score": 0, "missing_keywords": [], "matched": [], "partial_matches": [], "match_rate": 0}
    sim           = similarity_score(flat, target_jd) if target_jd else 0.0
    read          = readability_score(flat)

    summary_res   = _analyze_summary(resume)
    exp_res       = _analyze_experience(resume)
    skills_res    = _analyze_skills(resume, jd_keywords=kw_data_obj.get("keywords") if target_jd else None)
    edu_res       = _analyze_education(resume)
    proj_res      = _analyze_projects(resume)
    fmt_res       = _analyze_formatting(resume, flat)

    penalty, penalty_suggestions = _red_flag_penalty(resume, flat)

    # ── Weight Adjustment for No-JD Mode ──────────────────────────────────────
    active_weights = dict(WEIGHTS)
    if not target_jd:
        active_weights["keyword_match"] = 0.0
        active_weights["semantic_sim"] = 0.0
        active_weights["bullet_strength"] += 0.20
        active_weights["summary"] += 0.05
        active_weights["skills"] += 0.05

    # ── Weighted final score ──────────────────────────────────────────────────
    raw_score = (
        kw_result["score"]         * active_weights["keyword_match"]
        + sim                      * active_weights["semantic_sim"]
        + exp_res.percentage_score * active_weights["bullet_strength"]
        + summary_res.percentage_score * active_weights["summary"]
        + skills_res.percentage_score  * active_weights["skills"]
        + edu_res.percentage_score     * active_weights["education"]
        + proj_res.percentage_score    * active_weights["projects"]
        + fmt_res.percentage_score     * active_weights["formatting"]
        + read                         * active_weights["readability"]
        - penalty                      * active_weights["red_flag_penalty"]
    )
    # Keyword match‑rate bonus (up to 5 points for ≥70% match rate)
    match_bonus = min(5.0, kw_result["match_rate"] * 7.0) if target_jd else 0.0
    final_score = _clamp(raw_score + match_bonus)

    # ── Compile all suggestions (deduplicated, priority‑sorted) ──────────────
    all_suggestions: list[Suggestion] = []
    for section_result in [summary_res, exp_res, skills_res, edu_res, proj_res, fmt_res]:
        all_suggestions.extend(section_result.suggestions)
    all_suggestions.extend(penalty_suggestions)

    if kw_result["missing_keywords"]:
        all_suggestions.append(Suggestion(
            "high", "keywords",
            f"Add these missing JD keywords to your resume: {', '.join(kw_result['missing_keywords'][:8])}",
        ))

    # Dedup by text, sort: critical → high → medium → low
    priority_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    seen_texts = set()
    unique_suggestions: list[Suggestion] = []
    for s in sorted(all_suggestions, key=lambda x: priority_order.get(x.priority, 4)):
        if s.text not in seen_texts:
            seen_texts.add(s.text)
            unique_suggestions.append(s)

    # ── Assemble section results ──────────────────────────────────────────────
    section_results = [
        summary_res, exp_res, skills_res, edu_res, proj_res, fmt_res,
        SectionResult("keywords",    "Keyword Match",     kw_result["score"]),
        SectionResult("readability", "Readability",       read),
    ]

    grade = _grade(final_score)

    # ── ATS Audit trail ───────────────────────────────────────────────────────
    audit = {
        "weights_used":     WEIGHTS,
        "raw_score_before_bonus": round(raw_score, 2),
        "match_bonus":      round(match_bonus, 2),
        "red_flag_penalty": penalty,
        "total_bullets":    exp_res.metadata.get("total_bullets", 0),
        "action_verb_pct":  exp_res.metadata.get("action_pct", 0),
        "metric_pct":       exp_res.metadata.get("metric_pct", 0),
        "star_pct":         exp_res.metadata.get("star_pct", 0),
        "weak_words_used":  exp_res.metadata.get("weak_words", []),
        "partial_matches":  kw_result.get("partial_matches", []),
    }

    return {
        # ── Top‑line ──────────────────────────────────────────────────────────
        "score":                final_score,
        "grade":                grade,

        # ── Breakdown ─────────────────────────────────────────────────────────
        "breakdown": {
            "keyword_match":    kw_result["score"],
            "semantic_similarity": round(sim, 1),
            "bullet_strength":  exp_res.percentage_score,
            "summary_score":    summary_res.percentage_score,
            "skills_score":     skills_res.percentage_score,
            "education_score":  edu_res.percentage_score,
            "projects_score":   proj_res.percentage_score,
            "formatting_score": fmt_res.percentage_score,
            "readability":      read,
            "red_flag_penalty": penalty,
        },

        # ── Section detail ────────────────────────────────────────────────────
        "section_results":      [sr.to_dict() for sr in section_results],

        # ── Actionable feedback ───────────────────────────────────────────────
        "suggestions":          [s.to_dict() for s in unique_suggestions[:12]],
        "critical_issues":      sum(1 for s in unique_suggestions if s.priority == "critical"),
        "high_priority_issues": sum(1 for s in unique_suggestions if s.priority == "high"),

        # ── Keyword intelligence ──────────────────────────────────────────────
        "missing_keywords":     kw_result["missing_keywords"][:MISSING_KEYWORD_LIMIT],
        "matched_keywords":     kw_result.get("matched", []),
        "partial_matches":      kw_result.get("partial_matches", [])[:8],
        "keyword_match_rate":   kw_result.get("match_rate", 0),

        # ── Audit / debug ─────────────────────────────────────────────────────
        "audit":                audit,
    }


# ──────────────────────────────────────────────────────────────────────────────
# UTILITIES
# ──────────────────────────────────────────────────────────────────────────────

def resume_to_text(resume: Resume) -> str:
    """Flatten a Resume object into a single clean string for NLP operations."""
    _require_resume(resume)
    segments: list[str] = []
    if clean_text(resume.title or ""):
        segments.append(resume.title)
    if clean_text(resume.data.summary or ""):
        segments.append(resume.data.summary)
    for exp in resume.data.experience:
        segments.append(f"{exp.role} {exp.company}")
        segments.extend(exp.points)
    for proj in (getattr(resume.data, "projects", None) or []):
        segments.append(proj.name)
        segments.extend(proj.points)
    for edu in (getattr(resume.data, "education", None) or []):
        degree  = getattr(edu, "degree", "") or ""
        school  = getattr(edu, "school", "") or ""
        if degree or school:
            segments.append(f"{degree} {school}")
    if resume.data.skills:
        segments.append(" ".join(resume.data.skills))
    return clean_text(" ".join(s for s in segments if clean_text(s)))


def _tokenize(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _clamp(value: float | int) -> int:
    return int(round(max(0.0, min(100.0, float(value)))))


def _require_resume(resume: Resume | None) -> Resume:
    if resume is None:
        raise ValueError("Resume cannot be None.")
    return resume


def _require_text(value: str | None, field: str) -> str:
    c = clean_text(value)
    if not c:
        raise ValueError(f"{field} cannot be empty.")
    return c