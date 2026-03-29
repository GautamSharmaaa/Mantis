import React, { memo, useState } from "react";

// ─── Score tone helper ──────────────────────────────────────────────────────
function scoreTone(score) {
  if (score >= 90) return "perfect";
  if (score >= 75) return "strong";
  if (score >= 60) return "solid";
  if (score >= 40) return "weak";
  return "poor";
}

const TONE_COLOR = {
  perfect: "#09f59a",
  strong:  "#4ade80",
  solid:   "#60a5fa",
  weak:    "#fbbf24",
  poor:    "#f87171",
};

const TONE_LABEL = {
  perfect: "ATS Ready",
  strong:  "Good",
  solid:   "Average",
  weak:    "Needs Work",
  poor:    "Critical",
};

const PRIORITY_ICON = {
  critical: "🔴",
  high:     "🟠",
  medium:   "🟡",
  low:      "⚪",
};

// ─── Circular SVG Meter ─────────────────────────────────────────────────────
function CircularMeter({ score, isLoading, tone }) {
  const R = 37;
  const C = 2 * Math.PI * R; // ≈ 232.5
  const pct = isLoading ? 0 : Math.min(Math.max(score, 0), 100);
  const offset = C * (1 - pct / 100);
  const color = TONE_COLOR[tone] || "#09f59a";

  return (
    <svg
      viewBox="0 0 100 100"
      className="ats-meter"
      aria-label={`ATS Score ${score} out of 100`}
    >
      <defs>
        <radialGradient id={`ats-glow-${tone}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id="ats-blur">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Glow halo */}
      <circle cx="50" cy="50" r="44" fill={`url(#ats-glow-${tone})`} />

      {/* Track */}
      <circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="6"
      />

      {/* Progress arc — glowing */}
      <circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
        className="ats-meter__arc"
        filter="url(#ats-blur)"
      />

      {/* Score number */}
      <text
        x="50" y="46"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize="22"
        fontWeight="800"
        fontFamily="inherit"
      >
        {isLoading ? "…" : score}
      </text>
      <text
        x="50" y="63"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize="9"
        fontFamily="inherit"
      >
        / 100
      </text>
    </svg>
  );
}

// ─── Section Breakdown Row ────────────────────────────────────────────────────
function SectionRow({ sec, isOpen, onToggle, animIndex }) {
  const pct = sec.percentageScore ?? 0;
  const tone = pct >= 75 ? "strong" : pct >= 50 ? "weak" : "poor";
  const hasChecks = sec.checks && sec.checks.length > 0;

  return (
    <div
      className={`ats-section ${isOpen ? "ats-section--open" : ""}`}
      style={{ animationDelay: `${animIndex * 35}ms` }}
    >
      <button
        className="ats-section__header"
        onClick={() => hasChecks && onToggle(sec.sectionId)}
        type="button"
        aria-expanded={isOpen}
      >
        <span className="ats-section__name">{sec.name}</span>
        <div className="ats-section__bar">
          <i
            className={`ats-section__fill ats-section__fill--${tone}`}
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </div>
        <strong className={`ats-section__pct ats-section__pct--${tone}`}>
          {pct}%
        </strong>
        {hasChecks && (
          <span className="ats-section__chevron" aria-hidden="true">
            {isOpen ? "▾" : "▸"}
          </span>
        )}
      </button>

      {isOpen && hasChecks && (
        <div className="ats-section__checks">
          {sec.checks.map((c) => (
            <div
              key={c.id}
              className={`ats-check ${c.passed ? "ats-check--pass" : "ats-check--fail"}`}
            >
              <span className="ats-check__icon">{c.passed ? "✓" : "✗"}</span>
              <div>
                <strong>{c.label}</strong>
                {c.message && <p>{c.message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main ATSPanel ────────────────────────────────────────────────────────────
const ATSPanel = memo(function ATSPanel({
  scoreData,
  isLoading,
  scoreDelta,
  jobDescription,
  onManualCheck,
  onPowerGenerate,
  isPowerLoading,
}) {
  const [expandedSection, setExpandedSection] = useState(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const score           = scoreData.score || 0;
  const grade           = scoreData.grade || {};
  const sectionResults  = scoreData.section_results || [];
  const suggestions     = scoreData.suggestions || [];
  const weakWords       = (scoreData.audit?.weak_words_used || []).slice(0, 6);
  const missingKeywords = (scoreData.missing_keywords || []).slice(0, 10);
  const matchedKeywords = (scoreData.matched_keywords || []).slice(0, 8);
  const criticalIssues  = scoreData.critical_issues || 0;
  const highIssues      = scoreData.high_priority_issues || 0;
  const hasScore        = score > 0;
  const hasJobTarget    = Boolean(jobDescription?.trim());

  const tone       = scoreTone(score);
  const color      = TONE_COLOR[tone];
  const toneLabel  = TONE_LABEL[tone];

  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 4);
  const toggleSection = (id) => setExpandedSection((p) => (p === id ? null : id));

  return (
    <section className="ats-dock" aria-label="ATS Score Panel">

      {/* ── Col 1: Score Meter ──────────────────────────── */}
      <div className="ats-dock__score-col">
        <CircularMeter score={score} isLoading={isLoading} tone={tone} />

        <div className="ats-dock__score-labels">
          {hasScore ? (
            <span
              className={`ats-dock__grade-badge ats-dock__grade-badge--${tone}`}
            >
              {grade.grade || "–"}  ·  {toneLabel}
            </span>
          ) : (
            <span className="ats-dock__grade-badge ats-dock__grade-badge--empty">
              No score yet
            </span>
          )}

          {scoreDelta != null && scoreDelta !== 0 && (
            <span
              className={`ats-dock__delta ${scoreDelta > 0 ? "ats-dock__delta--up" : "ats-dock__delta--down"}`}
            >
              {scoreDelta > 0 ? `↗ +${scoreDelta}` : `↘ ${scoreDelta}`} pts
            </span>
          )}

          {criticalIssues > 0 && (
            <span className="ats-dock__critical-badge">
              {criticalIssues} critical
            </span>
          )}

          <button
            className={`ats-dock__check-btn ${isLoading ? "ats-dock__check-btn--loading" : ""}`}
            onClick={onManualCheck}
            disabled={isLoading}
            type="button"
          >
            {isLoading ? "Checking…" : "↻ Recheck"}
          </button>
        </div>
      </div>

      {/* ── Col 2: Section Breakdown ─────────────────────── */}
      <div className="ats-dock__breakdown-col">
        <p className="ats-dock__col-label">Section Breakdown</p>
        <div className="ats-dock__sections">
          {sectionResults.length === 0 && (
            <span className="ats-dock__empty">
              {hasJobTarget
                ? "Run a check to see section scores"
                : "Add a job description to enable scoring"}
            </span>
          )}
          {sectionResults.map((sec, i) => (
            <SectionRow
              key={sec.sectionId}
              sec={sec}
              isOpen={expandedSection === sec.sectionId}
              onToggle={toggleSection}
              animIndex={i}
            />
          ))}
        </div>
      </div>

      {/* ── Col 3: Suggestions + Power ───────────────────── */}
      <div className="ats-dock__actions-col">
        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className="ats-dock__suggestions">
            <p className="ats-dock__col-label">
              ✦ AI Suggestions
              {highIssues > 0 && (
                <em className="ats-dock__high-count">{highIssues} high</em>
              )}
            </p>
            <div className="ats-dock__suggestion-list">
              {visibleSuggestions.map((s, i) => (
                <div
                  key={i}
                  className={`ats-suggestion ats-suggestion--${s.priority || "medium"}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className="ats-suggestion__priority" aria-label={s.priority}>
                    {PRIORITY_ICON[s.priority] || "🟡"}
                  </span>
                  <div>
                    <span className="ats-suggestion__badge">{s.section}</span>
                    <p>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
            {suggestions.length > 4 && (
              <button
                className="ats-dock__show-more"
                onClick={() => setShowAllSuggestions((v) => !v)}
                type="button"
              >
                {showAllSuggestions
                  ? "↑ Show less"
                  : `+ ${suggestions.length - 4} more suggestions`}
              </button>
            )}
          </div>
        )}

        {/* Power Generate */}
        <button
          className={`ats-dock__power-btn ${isPowerLoading ? "ats-dock__power-btn--loading" : ""}`}
          onClick={onPowerGenerate}
          disabled={isPowerLoading || isLoading}
          type="button"
        >
          <span className="ats-dock__power-icon">⚡</span>
          <span>
            {isPowerLoading
              ? "Generating ATS-100 Resume…"
              : hasJobTarget
              ? "Power Generate — ATS 100"
              : "Power Generate"}
          </span>
        </button>
      </div>

      {/* ── Row 2: Keywords full-width ───────────────────── */}
      <div className="ats-dock__keywords-row">
        {matchedKeywords.length > 0 && (
          <div className="ats-dock__keyword-group">
            <span className="ats-dock__kw-label ats-dock__kw-label--matched">
              ✓ Matched
            </span>
            <div className="ats-dock__keyword-chips">
              {matchedKeywords.map((k) => (
                <em key={k} className="ats-chip ats-chip--matched">{k}</em>
              ))}
            </div>
          </div>
        )}

        {missingKeywords.length > 0 && (
          <div className="ats-dock__keyword-group">
            <span className="ats-dock__kw-label ats-dock__kw-label--missing">
              ⚠ Missing
            </span>
            <div className="ats-dock__keyword-chips">
              {missingKeywords.map((k) => (
                <em key={k} className="ats-chip ats-chip--missing">{k}</em>
              ))}
            </div>
          </div>
        )}

        {weakWords.length > 0 && (
          <div className="ats-dock__keyword-group">
            <span className="ats-dock__kw-label ats-dock__kw-label--weak">
              ⊘ Weak Phrases
            </span>
            <div className="ats-dock__keyword-chips">
              {weakWords.map((w) => (
                <em key={w} className="ats-chip ats-chip--weak">{w}</em>
              ))}
            </div>
          </div>
        )}

        {!hasJobTarget && missingKeywords.length === 0 && matchedKeywords.length === 0 && (
          <span className="ats-dock__no-target">
            Add a job description in the AI Assistant to see keyword analysis
          </span>
        )}
      </div>
    </section>
  );
});

export default ATSPanel;
