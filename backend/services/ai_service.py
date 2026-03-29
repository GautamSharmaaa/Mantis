from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from models.resume_model import ExperienceItem, ProjectItem, Resume, ResumeData
from services.resume_service import update_timestamp
from utils.cache import build_cache_key, get_cached_value, set_cached_value
from utils.helpers import current_timestamp, generate_uuid
from utils.text_utils import clean_text, validate_bullet_length

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────
#  Constants
# ─────────────────────────────────────────────
DEFAULT_GENERATION_MODEL = "gpt-4o-mini"
DEFAULT_EDIT_MODEL = "gpt-4o-mini"
DEFAULT_TEMPLATE = "classic"
DEFAULT_GENERATED_TITLE = "Imported Resume"

MAX_SECTION_WORDS = 80
MAX_JD_WORDS = 120
PREFERRED_BULLET_MIN_WORDS = 8
PREFERRED_BULLET_MAX_WORDS = 20

MAX_RETRIES = 2
RETRY_DELAY_SECONDS = 1.0

GEMINI_MODEL = "gemini-2.5-flash"
OPENAI_PREFIX = "sk-"
GEMINI_PREFIX = "AIza"


# ─────────────────────────────────────────────
#  Types & Enums
# ─────────────────────────────────────────────
class Provider(str, Enum):
    OPENAI = "openai"
    GEMINI = "gemini"
    UNKNOWN = "unknown"


@dataclass
class AICallConfig:
    """Typed config for every AI call — replaces scattered kwargs."""
    instructions: str
    input_text: str
    model: str
    max_tokens: int
    schema: dict | None = None
    strict_schema: bool = False
    temperature: float = 0.2


@dataclass
class BulletQuality:
    """Result of bullet analysis — used by improve_bullet and score_resume."""
    has_action_verb: bool = False
    has_metric: bool = False
    word_count: int = 0
    is_preferred_length: bool = False
    passes: bool = False


# ─────────────────────────────────────────────
#  Strong action verbs & weak phrase detection
# ─────────────────────────────────────────────
_STRONG_VERBS: frozenset[str] = frozenset({
    "led", "built", "deployed", "reduced", "increased", "architected",
    "automated", "designed", "developed", "launched", "managed", "optimised",
    "optimized", "created", "delivered", "improved", "implemented", "integrated",
    "migrated", "owned", "produced", "refactored", "scaled", "shipped", "streamlined",
    "transformed", "unified", "upgraded", "wrote", "spearheaded", "pioneered",
    "established", "generated", "negotiated", "secured", "mentored", "coached",
})

_WEAK_PHRASES: tuple[str, ...] = (
    "responsible for", "helped with", "worked on", "assisted",
    "was involved in", "participated in", "contributed to", "handled",
    "tried to", "attempted to",
)


# ─────────────────────────────────────────────
#  Public — generation
# ─────────────────────────────────────────────

def generate_initial_resume(resume_text: str, jd: str, api_key: str) -> Resume:
    """
    Convert raw resume text into Mantis' structured Resume object.
    This is the ONLY function that processes the full raw resume text.
    """
    source_resume = _require_non_empty_text(resume_text, "resume_text")
    cleaned_jd = clean_text(jd)

    structured_payload = _generate_structured_resume_data(source_resume, cleaned_jd, api_key)
    if structured_payload is None:
        logger.warning("generate_initial_resume: structured payload was None — returning empty resume.")
        return _build_empty_generated_resume(source_resume)

    return _build_resume_from_payload(structured_payload, source_resume)


def optimize_full_resume(resume_data: dict, jd: str, profile: dict, api_key: str, experience_level: str = "Intermediate", target_role: str = "") -> dict | None:
    """
    Rewrites every bullet, summary, and skills list to maximise ATS alignment.
    Falls back to profile context when no JD is supplied.
    """
    context, context_label = _resolve_context(jd, profile)
    role_level_context = _build_role_level_prompt(experience_level, target_role)

    raw_output = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=DEFAULT_GENERATION_MODEL,
            instructions=(
                f"You are a world-class resume optimizer. You will be given a structured resume JSON "
                f"and a {context_label}.\n"
                f"{role_level_context}\n"
                "Rules:\n"
                "• Rewrite EVERY bullet to start with a strong action verb and contain ≥1 quantifiable metric.\n"
                "• Rewrite the summary as a punchy 2–3 sentence professional pitch.\n"
                "• Expand the skills list with highly relevant keywords from the context.\n"
                "• Preserve role names, company names, and project names exactly.\n"
                "• NEVER use: 'responsible for', 'helped', 'worked on', 'assisted'.\n"
                "Return the full updated resume JSON matching the exact input schema."
            ),
            input_text=(
                f"Resume JSON:\n{json.dumps(resume_data)}\n\n"
                f"{context_label}:\n{context}"
            ),
            schema=_resume_data_schema(),
            max_tokens=3000,
            strict_schema=True,
        ),
    )
    return _parse_dict_response(raw_output)


def power_generate(
    resume_data: dict,
    jd: str,
    profile: dict,
    api_key: str,
    experience_level: str = "Intermediate",
    target_role: str = "",
    ats_report: dict | None = None,
) -> dict | None:
    """
    The POWER button: generates a perfect ATS-100 resume from JD context.
    Uses the pre-computed ATS report to surgically fix every gap identified.
    """
    context, _ = _resolve_context(jd, profile)
    role_level_context = _build_role_level_prompt(experience_level, target_role)
    ats_context = _build_ats_context_block(ats_report or {})

    raw_output = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=DEFAULT_GENERATION_MODEL,
            instructions=(
                "You are the world's #1 resume writer. Your ONLY goal is to produce a resume that scores 100/100 on any ATS system.\n"
                f"{role_level_context}\n"
                "STRICT RULES (violating any = failure):\n"
                "1. EVERY bullet starts with a strong action verb (Led, Built, Deployed, Reduced, Increased, Architected, Automated).\n"
                "2. EVERY bullet contains ≥1 concrete metric (%, $, numbers, users, time saved).\n"
                "3. 3–5 bullets per experience, each 12–20 words.\n"
                "4. Summary: 2–3 sentences with years of experience and key specialties.\n"
                "5. Skills list MUST include every keyword listed in the ATS MISSING KEYWORDS section below.\n"
                "6. For every ATS suggestion below, make the specific fix described.\n"
                "7. Create 2–3 impressive, realistic projects demonstrating applied JD skills.\n"
                "8. Project bullets must also have action verbs + metrics.\n"
                "9. Preserve existing role/company names; fill in realistic values if empty.\n"
                "10. NEVER use: 'responsible for', 'helped', 'worked on', 'assisted'.\n"
                "Return the complete resume data JSON matching the schema perfectly."
            ),
            input_text=(
                f"## Current Resume Data\n{json.dumps(resume_data)}\n\n"
                f"## Target Job Description\n{context}\n\n"
                f"## User Profile\n{json.dumps(profile)}\n\n"
                f"{ats_context}"
            ),
            schema=_resume_data_schema(),
            max_tokens=4000,
            strict_schema=True,
        ),
    )
    return _parse_dict_response(raw_output)


# ─────────────────────────────────────────────
#  Public — editing
# ─────────────────────────────────────────────

def improve_bullet(bullet: str, jd: str, api_key: str, experience_level: str = "Intermediate", target_role: str = "") -> str:
    """Improve a single bullet for clarity, impact, and ATS relevance."""
    original_bullet = _require_non_empty_text(bullet, "bullet")
    cleaned_jd = clean_text(jd)
    role_level_context = _build_role_level_prompt(experience_level, target_role)
    instruction = (
        "Improve this resume bullet for clarity, impact, and ATS relevance. "
        f"{role_level_context} "
        "Start with a strong action verb. Include at least one concrete metric. "
        "Keep 8–20 words. Return only the revised bullet, no punctuation at end."
    )

    cached = _get_cached_text(original_bullet, cleaned_jd, instruction)
    if cached is not None:
        return cached

    response_text = _generate_text_response(
        prompt=_build_edit_prompt(instruction, original_bullet, cleaned_jd),
        api_key=api_key,
        model=DEFAULT_EDIT_MODEL,
        max_output_tokens=80,
    )

    if not clean_text(response_text):
        return original_bullet

    normalized = _normalize_ai_text(response_text, fallback=original_bullet)

    quality = _assess_bullet_quality(normalized)
    if not validate_bullet_length(normalized) or not quality.is_preferred_length:
        logger.debug("improve_bullet: AI output failed quality check — returning original.")
        return original_bullet

    return _store_cached_text(original_bullet, cleaned_jd, instruction, normalized)


def improve_summary(summary: str, jd: str, api_key: str) -> str:
    """Rewrite a professional summary to be concise, strong, and JD-tailored."""
    original_summary = _require_non_empty_text(summary, "summary")
    cleaned_jd = clean_text(jd)
    instruction = (
        "Rewrite this summary to be concise, strong, and tailored to the job description. "
        "2–3 sentences. Include years of experience if mentioned. "
        "Return only the revised summary."
    )

    cached = _get_cached_text(original_summary, cleaned_jd, instruction)
    if cached is not None:
        return cached

    response_text = _generate_text_response(
        prompt=_build_edit_prompt(instruction, original_summary, cleaned_jd),
        api_key=api_key,
        model=DEFAULT_EDIT_MODEL,
        max_output_tokens=160,
    )

    if not clean_text(response_text):
        return original_summary

    normalized = _normalize_ai_text(response_text, fallback=original_summary)
    return _store_cached_text(original_summary, cleaned_jd, instruction, normalized)


def chat_edit(instruction: str, selected_text: str, jd: str, api_key: str, experience_level: str = "Intermediate", target_role: str = "") -> str:
    """Apply a user-provided instruction to a selected piece of resume text."""
    cleaned_instruction = _require_non_empty_text(instruction, "instruction")
    original_text = _require_non_empty_text(selected_text, "selected_text")
    cleaned_jd = clean_text(jd)
    role_level_context = _build_role_level_prompt(experience_level, target_role)

    cached = _get_cached_text(original_text, cleaned_jd, cleaned_instruction)
    if cached is not None:
        return cached

    response_text = _generate_text_response(
        prompt=_build_edit_prompt(
            instruction=(
                f"{cleaned_instruction} "
                f"{role_level_context} "
                "Modify only the selected text. Do not rewrite unrelated content. "
                "Return only the updated text."
            ),
            selected_text=original_text,
            jd=cleaned_jd,
        ),
        api_key=api_key,
        model=DEFAULT_EDIT_MODEL,
        max_output_tokens=180,
    )

    if not clean_text(response_text):
        return original_text

    normalized = _normalize_ai_text(response_text, fallback=original_text)
    return _store_cached_text(original_text, cleaned_jd, cleaned_instruction, normalized)


# ─────────────────────────────────────────────
#  Public — analysis & suggestions
# ─────────────────────────────────────────────

def get_ai_suggestions(resume_data: dict, jd: str, ats_report: dict, api_key: str, experience_level: str = "Intermediate", target_role: str = "") -> list[str]:
    """
    Generate 5 specific, actionable suggestions based on ATS analysis results.
    Returns an empty list on any failure.
    """
    role_level_context = _build_role_level_prompt(experience_level, target_role)
    raw_output = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=DEFAULT_GENERATION_MODEL,
            instructions=(
                "Given an ATS analysis report and a resume, provide exactly 5 specific, actionable suggestions "
                "to improve the ATS score. Each suggestion must be one clear, specific sentence. "
                "Reference exact bullets or sections where possible. "
                "Focus on the weakest areas identified in the report. "
                f"{role_level_context}\n"
                "Return a JSON array of exactly 5 strings."
            ),
            input_text=(
                f"Resume:\n{json.dumps(resume_data)}\n\n"
                f"Job Description:\n{jd}\n\n"
                f"ATS Report:\n{json.dumps(ats_report)}"
            ),
            schema={"type": "array", "items": {"type": "string"}},
            max_tokens=600,
            strict_schema=False,
        ),
    )

    if not raw_output.strip():
        return []

    try:
        parsed = json.loads(raw_output)
        if isinstance(parsed, list):
            return [str(s) for s in parsed[:5]]
        return []
    except Exception:
        logger.warning("get_ai_suggestions: failed to parse AI response as JSON list.")
        return []


def score_bullets(bullets: list[str]) -> list[BulletQuality]:
    """
    Locally score a list of bullets without an AI call.
    Useful for real-time UI feedback and pre-flight checks before optimization.
    """
    return [_assess_bullet_quality(b) for b in bullets]


def detect_weak_bullets(resume_data: dict) -> list[dict]:
    """
    Return a list of {'section', 'index', 'bullet', 'reason'} dicts
    for every bullet that fails quality checks — no AI call required.
    """
    weak: list[dict] = []

    for exp_idx, exp in enumerate(_safe_list(resume_data.get("experience"))):
        for b_idx, bullet in enumerate(_safe_list(exp.get("points"))):
            quality = _assess_bullet_quality(bullet)
            if not quality.passes:
                weak.append({
                    "section": "experience",
                    "exp_index": exp_idx,
                    "bullet_index": b_idx,
                    "bullet": bullet,
                    "reason": _quality_failure_reason(quality),
                })

    for proj_idx, proj in enumerate(_safe_list(resume_data.get("projects"))):
        for b_idx, bullet in enumerate(_safe_list(proj.get("points"))):
            quality = _assess_bullet_quality(bullet)
            if not quality.passes:
                weak.append({
                    "section": "projects",
                    "proj_index": proj_idx,
                    "bullet_index": b_idx,
                    "bullet": bullet,
                    "reason": _quality_failure_reason(quality),
                })

    return weak


# ─────────────────────────────────────────────
#  Public — profile utilities
# ─────────────────────────────────────────────

def extract_full_profile_data(resume_text: str, api_key: str) -> dict[str, str] | None:
    """
    Extract all factual resume data into a flat {key: string} dictionary.
    Keys: fullName, email, phone, location, jobTitle, website, linkedin, github,
    plus any other sections detected (camelCase, string values only).
    """
    raw_output = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=DEFAULT_GENERATION_MODEL,
            instructions=(
                "Extract all factual content from the resume into a flat JSON dictionary of strings. "
                "Map basic info to: fullName, email, phone, location, jobTitle, website, linkedin, github. "
                "For ALL other sections found (summary, experience, projects, education, certifications, "
                "skills, hobbies, etc.), create a camelCase key with the full raw text as the string value. "
                "No arrays. No nested objects. Every value must be a string."
            ),
            input_text=resume_text,
            schema={"type": "object"},
            max_tokens=2000,
            strict_schema=False,
        ),
    )

    if not raw_output.strip():
        return None

    try:
        parsed = json.loads(raw_output)
        if not isinstance(parsed, dict):
            return None
        return {
            k: (
                "\n".join(str(i) for i in v)
                if isinstance(v, list)
                else json.dumps(v) if isinstance(v, dict)
                else str(v)
            )
            for k, v in parsed.items()
        }
    except Exception:
        logger.warning("extract_full_profile_data: failed to parse response.")
        return None


def sync_profile_into_resume(profile_payload: dict, resume_payload: dict, api_key: str) -> dict | None:
    """
    Merge flat profile data into a structured resume JSON without overwriting
    fields not referenced in the profile.
    """
    raw_output = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=DEFAULT_GENERATION_MODEL,
            instructions=(
                "You are given a structured resume JSON and a flat profile dictionary with updated information. "
                "Merge the new profile data into the structured resume schema. "
                "Map raw text from the profile into the 'role', 'company', 'name', and 'points' fields. "
                "Do NOT overwrite existing resume fields that are absent from the profile. "
                "Return only the valid JSON matching the updated resume structure."
            ),
            input_text=(
                f"Current Resume JSON:\n{json.dumps(resume_payload)}\n\n"
                f"Updated Profile Context:\n{json.dumps(profile_payload)}"
            ),
            schema=_resume_data_schema(),
            max_tokens=2500,
            strict_schema=True,
        ),
    )
    return _parse_dict_response(raw_output)


# ─────────────────────────────────────────────
#  Public — resume accessors
# ─────────────────────────────────────────────

def get_summary(resume: Resume) -> str:
    return _require_resume(resume).data.summary


def get_experience_section(resume: Resume) -> list[ExperienceItem]:
    return _require_resume(resume).data.experience


def get_project_section(resume: Resume) -> list[ProjectItem]:
    return _require_resume(resume).data.projects


def get_experience(resume: Resume, index: int) -> ExperienceItem:
    target = _require_resume(resume)
    return _get_by_index(target.data.experience, index, "experience")


def get_project(resume: Resume, index: int) -> ProjectItem:
    target = _require_resume(resume)
    return _get_by_index(target.data.projects, index, "project")


def apply_update(
    resume: Resume,
    update_fn: Callable[..., Resume | None],
    *args: Any,
    **kwargs: Any,
) -> Resume:
    """Apply an update function to a Resume and stamp the timestamp."""
    target = _require_resume(resume)
    updated = update_fn(target, *args, **kwargs)
    if updated is None:
        updated = target
    if not isinstance(updated, Resume):
        raise TypeError("update_fn must return a Resume or mutate the provided Resume.")
    return update_timestamp(updated)


# ─────────────────────────────────────────────
#  Private — structured resume generation
# ─────────────────────────────────────────────

def _generate_structured_resume_data(
    resume_text: str,
    jd: str,
    api_key: str,
) -> dict[str, Any] | None:
    raw_output = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=DEFAULT_GENERATION_MODEL,
            instructions=(
                "Convert the resume into structured JSON. Extract factual content only — do not fabricate. "
                "Return summary, experience (role, company, points), projects (name, points), and skills."
            ),
            input_text=(
                f"Resume:\n{resume_text}\n\n"
                f"Job Description:\n{_trim_words(jd, MAX_JD_WORDS)}"
            ),
            schema=_resume_data_schema(),
            max_tokens=1500,
            strict_schema=True,
        ),
    )

    if not raw_output.strip():
        return None

    try:
        parsed = json.loads(raw_output)
    except json.JSONDecodeError:
        logger.warning("_generate_structured_resume_data: JSON decode error.")
        return None

    return parsed if isinstance(parsed, dict) else None


# ─────────────────────────────────────────────
#  Private — AI call orchestration
# ─────────────────────────────────────────────

def _detect_provider(api_key: str) -> Provider:
    if api_key.startswith(GEMINI_PREFIX):
        return Provider.GEMINI
    if api_key.startswith(OPENAI_PREFIX):
        return Provider.OPENAI
    logger.warning("_detect_provider: key prefix unrecognised — defaulting to OpenAI.")
    return Provider.OPENAI


def _execute_ai_call_with_retry(api_key: str, config: AICallConfig) -> str:
    """
    Execute an AI call with automatic retry on empty/transient failures.
    MAX_RETRIES additional attempts after the first try.
    """
    cleaned_key = _require_non_empty_text(api_key, "api_key")
    provider = _detect_provider(cleaned_key)

    for attempt in range(MAX_RETRIES + 1):
        try:
            result = (
                _call_gemini(cleaned_key, config)
                if provider == Provider.GEMINI
                else _call_openai(cleaned_key, config)
            )
            if result.strip():
                return result
            logger.debug("_execute_ai_call_with_retry: empty response on attempt %d.", attempt + 1)
        except Exception as exc:
            logger.error("AI call error on attempt %d: %s", attempt + 1, exc)

        if attempt < MAX_RETRIES:
            time.sleep(RETRY_DELAY_SECONDS)

    logger.error("_execute_ai_call_with_retry: all attempts exhausted.")
    return ""


def _call_gemini(api_key: str, config: AICallConfig) -> str:
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        config_dict: dict[str, Any] = {
            "system_instruction": config.instructions,
            "max_output_tokens": config.max_tokens,
            "temperature": config.temperature,
        }
        if config.schema:
            config_dict["response_mime_type"] = "application/json"
            config_dict["response_schema"] = config.schema

        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[config.input_text],
            config=types.GenerateContentConfig(**config_dict),
        )
        return response.text or ""
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        raise


def _call_openai(api_key: str, config: AICallConfig) -> str:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("The 'openai' package is not installed.") from exc

    try:
        client = OpenAI(api_key=api_key)
        kwargs: dict[str, Any] = {
            "model": config.model,
            "instructions": config.instructions,
            "input": config.input_text,
            "reasoning": {"effort": "none"},
            "max_output_tokens": config.max_tokens,
            "store": False,
        }
        if config.schema:
            kwargs["text"] = {
                "format": {
                    "type": "json_schema",
                    "name": "structured_data",
                    "strict": config.strict_schema,
                    "schema": config.schema,
                }
            }

        response = client.responses.create(**kwargs)
        return getattr(response, "output_text", "") or ""
    except Exception as exc:
        logger.error("OpenAI API error: %s", exc)
        raise


def _generate_text_response(
    prompt: str,
    api_key: str,
    model: str,
    max_output_tokens: int,
) -> str:
    raw = _execute_ai_call_with_retry(
        api_key=api_key,
        config=AICallConfig(
            model=model,
            instructions="Resume editing assistant. Return plain text only — no markdown, no JSON.",
            input_text=prompt,
            max_tokens=max_output_tokens,
        ),
    )
    return raw if isinstance(raw, str) else ""


# ─────────────────────────────────────────────
#  Private — quality analysis
# ─────────────────────────────────────────────

def _assess_bullet_quality(bullet: str) -> BulletQuality:
    """Locally analyse a bullet without any AI call."""
    cleaned = clean_text(bullet) or ""
    words = cleaned.lower().split()
    wc = len(words)

    has_verb = bool(words) and words[0] in _STRONG_VERBS
    has_metric = any(
        char.isdigit() or char in ("%", "$", "x", "X")
        for char in cleaned
    )
    preferred = PREFERRED_BULLET_MIN_WORDS <= wc <= PREFERRED_BULLET_MAX_WORDS
    passes = has_verb and has_metric and preferred

    return BulletQuality(
        has_action_verb=has_verb,
        has_metric=has_metric,
        word_count=wc,
        is_preferred_length=preferred,
        passes=passes,
    )


def _quality_failure_reason(q: BulletQuality) -> str:
    reasons: list[str] = []
    if not q.has_action_verb:
        reasons.append("missing strong action verb")
    if not q.has_metric:
        reasons.append("no quantifiable metric")
    if not q.is_preferred_length:
        reasons.append(f"word count {q.word_count} outside 8–20 range")
    return "; ".join(reasons) if reasons else "unknown"


# ─────────────────────────────────────────────
#  Private — resume construction
# ─────────────────────────────────────────────

def _build_resume_from_payload(payload: dict[str, Any], source_resume_text: str) -> Resume:
    sanitized = _sanitize_resume_data(payload)
    try:
        validated_data = ResumeData.model_validate(sanitized)
    except Exception:
        logger.warning("_build_resume_from_payload: validation failed — returning empty resume.")
        return _build_empty_generated_resume(source_resume_text)

    return Resume(
        id=generate_uuid(),
        title=_derive_resume_title(source_resume_text),
        template=DEFAULT_TEMPLATE,
        ats_score=0.0,
        last_updated=current_timestamp(),
        data=validated_data,
    )


def _build_empty_generated_resume(source_resume_text: str) -> Resume:
    return Resume(
        id=generate_uuid(),
        title=_derive_resume_title(source_resume_text),
        template=DEFAULT_TEMPLATE,
        ats_score=0.0,
        last_updated=current_timestamp(),
        data=ResumeData(),
    )


def _sanitize_resume_data(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalise a raw AI payload into a clean, schema-safe dict."""
    data = payload.get("data", payload)
    if not isinstance(data, dict):
        return {"summary": "", "experience": [], "projects": [], "skills": []}

    summary = clean_text(data.get("summary")) or ""

    experience: list[dict] = []
    for item in _safe_list(data.get("experience")):
        if not isinstance(item, dict):
            continue
        role = clean_text(item.get("role"))
        company = clean_text(item.get("company"))
        if not role or not company:
            continue
        points = [p for p in (clean_text(pt) for pt in _safe_list(item.get("points"))) if p]
        experience.append({"role": role, "company": company, "points": points})

    projects: list[dict] = []
    for item in _safe_list(data.get("projects")):
        if not isinstance(item, dict):
            continue
        name = clean_text(item.get("name"))
        if not name:
            continue
        points = [p for p in (clean_text(pt) for pt in _safe_list(item.get("points"))) if p]
        projects.append({"name": name, "points": points})

    seen: set[str] = set()
    skills: list[str] = []
    for skill in _safe_list(data.get("skills")):
        cleaned = clean_text(skill)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key not in seen:
            seen.add(key)
            skills.append(cleaned)

    return {"summary": summary, "experience": experience, "projects": projects, "skills": skills}


# ─────────────────────────────────────────────
#  Private — schema
# ─────────────────────────────────────────────

def _resume_data_schema() -> dict[str, Any]:
    """JSON Schema for the structured resume data object."""
    return {
        "type": "object",
        "required": ["summary", "experience", "projects", "skills"],
        "properties": {
            "summary": {"type": "string"},
            "experience": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["role", "company", "points"],
                    "properties": {
                        "role": {"type": "string"},
                        "company": {"type": "string"},
                        "points": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "projects": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["name", "points"],
                    "properties": {
                        "name": {"type": "string"},
                        "points": {"type": "array", "items": {"type": "string"}},
                    },
                },
            },
            "skills": {"type": "array", "items": {"type": "string"}},
        },
    }


# ─────────────────────────────────────────────
#  Private — prompt helpers
# ─────────────────────────────────────────────

def _build_role_level_prompt(experience_level: str, target_role: str) -> str:
    parts = []
    if target_role:
        parts.append(f"Target Role: {target_role}")
    if experience_level:
        parts.append(f"Experience Level: {experience_level}")
        if experience_level.lower() == "beginner":
            parts.append("The user is a beginner. Focus heavily on academic projects (if any) and skills. If a summary isn't necessary, return an empty string \"\" for the summary.")
        elif experience_level.lower() == "expert":
            parts.append("The user is an expert. Focus aggressively on measurable business outcomes, leadership, and high-impact metrics.")
    return " ".join(parts)


def _build_ats_context_block(ats_report: dict) -> str:
    """Convert a `calculate_ats_score` report into a structured LLM prompt section."""
    if not ats_report:
        return ""

    lines: list[str] = ["## ATS Analysis — Fix These Issues to Hit 100/100\n"]

    # Current score
    score = ats_report.get("score")
    grade = ats_report.get("grade", "")
    if score is not None:
        lines.append(f"**Current ATS Score: {score}/100 ({grade})** — your goal is 100.\n")

    # Missing keywords — critical to add
    missing = ats_report.get("missing_keywords", [])
    if missing:
        lines.append(f"**MISSING KEYWORDS (MUST add ALL to skills and bullets):** {', '.join(missing)}\n")

    # Partial matches — close but not exact
    partial = ats_report.get("partial_matches", [])
    if partial:
        lines.append(f"**Partial keyword matches (strengthen these):** {', '.join(partial[:6])}\n")

    # Section-level scores
    section_results = ats_report.get("section_results", [])
    weak_sections = [
        f"{sr.get('name', sr.get('sectionId', '?'))} ({sr.get('percentageScore', sr.get('score', 0)):.0f}/100)"
        for sr in section_results
        if isinstance(sr, dict) and sr.get("percentageScore", sr.get("score", 100)) < 80
    ]
    if weak_sections:
        lines.append(f"**Weak sections to improve:** {', '.join(weak_sections)}\n")

    # Actionable suggestions from ATS engine
    suggestions = ats_report.get("suggestions", [])
    if suggestions:
        lines.append("**ATS Suggestions (implement ALL of these):**")
        for s in suggestions[:10]:
            if isinstance(s, dict):
                priority = s.get("priority", "")
                text = s.get("text", "")
                if text:
                    prefix = "🔴" if priority == "critical" else "🟠" if priority == "high" else "🟡"
                    lines.append(f"  {prefix} {text}")
            elif isinstance(s, str):
                lines.append(f"  • {s}")
        lines.append("")

    # Breakdown scores
    breakdown = ats_report.get("breakdown", {})
    if breakdown:
        low_dims = [
            f"{k.replace('_', ' ').title()}: {v:.0f}%"
            for k, v in breakdown.items()
            if isinstance(v, (int, float)) and v < 75 and k != "red_flag_penalty"
        ]
        if low_dims:
            lines.append(f"**Low-scoring dimensions:** {', '.join(low_dims)}\n")

    return "\n".join(lines)




def _build_edit_prompt(instruction: str, selected_text: str, jd: str) -> str:
    return (
        f"Instruction: {instruction}\n"
        f"Selected text: {_trim_words(selected_text, MAX_SECTION_WORDS)}\n"
        f"Job description: {_trim_words(jd, MAX_JD_WORDS)}"
    )


def _resolve_context(jd: str, profile: dict) -> tuple[str, str]:
    """Return (context_text, label) — prefer JD, fall back to profile."""
    stripped = jd.strip()
    if stripped:
        return stripped, "Job Description"
    return json.dumps(profile), "User Profile Context"


# ─────────────────────────────────────────────
#  Private — cache helpers
# ─────────────────────────────────────────────

def _get_cached_text(selected_text: str, jd: str, instruction: str) -> str | None:
    return get_cached_value(build_cache_key(selected_text, jd, instruction))


def _store_cached_text(selected_text: str, jd: str, instruction: str, value: str) -> str:
    return set_cached_value(build_cache_key(selected_text, jd, instruction), value)


# ─────────────────────────────────────────────
#  Private — text utilities
# ─────────────────────────────────────────────

def _normalize_ai_text(value: Any, fallback: str) -> str:
    if not isinstance(value, str):
        return fallback
    return clean_text(value) or fallback


def _trim_words(text: str, limit: int) -> str:
    cleaned = clean_text(text)
    if not cleaned:
        return ""
    words = cleaned.split()
    return " ".join(words[:limit]) if len(words) > limit else cleaned


def _word_count(text: str) -> int:
    cleaned = clean_text(text)
    return len(cleaned.split()) if cleaned else 0


def _is_preferred_bullet_length(text: str) -> bool:
    wc = _word_count(text)
    return PREFERRED_BULLET_MIN_WORDS <= wc <= PREFERRED_BULLET_MAX_WORDS


def _safe_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _parse_dict_response(raw_output: str) -> dict | None:
    if not raw_output.strip():
        return None
    try:
        parsed = json.loads(raw_output)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        logger.warning("_parse_dict_response: failed to parse JSON.")
        return None


# ─────────────────────────────────────────────
#  Private — guards
# ─────────────────────────────────────────────

def _require_resume(resume: Resume | None) -> Resume:
    if resume is None:
        raise ValueError("Resume cannot be null.")
    return resume


def _require_non_empty_text(value: str | None, field_name: str) -> str:
    cleaned = clean_text(value)
    if not cleaned:
        raise ValueError(f"'{field_name}' cannot be empty.")
    return cleaned


def _derive_resume_title(source_resume_text: str) -> str:
    for raw_line in source_resume_text.splitlines():
        cleaned = clean_text(raw_line)
        if cleaned:
            return cleaned[:80]
    return DEFAULT_GENERATED_TITLE


def _get_by_index(items: list[Any], index: int | None, label: str) -> Any:
    if index is None:
        raise ValueError(f"{label.capitalize()} index cannot be null.")
    if index < 0 or index >= len(items):
        raise IndexError(f"{label.capitalize()} index {index} is out of range (len={len(items)}).")
    return items[index]