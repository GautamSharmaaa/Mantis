from __future__ import annotations

import io
import re
from pathlib import Path

from utils.text_utils import clean_text

SUPPORTED_IMPORT_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}

_SECTION_ALIASES = {
    "summary": {"summary", "professional summary", "profile", "about"},
    "experience": {"experience", "work experience", "professional experience", "employment history"},
    "skills": {"skills", "technical skills", "core skills", "expertise"},
    "projects": {"projects", "selected projects"},
    "education": {"education"},
}

_LOCATION_PATTERN = re.compile(
    r"\b(?:[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*,\s*[A-Z]{2}|"
    r"[A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*,\s*[A-Z][a-z]+|"
    r"Remote|Hybrid)\b"
)
_EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE_PATTERN = re.compile(r"(?:\+?\(?\d[\d\s().-]{7,}\d)")
_LINK_PATTERN = re.compile(r"(https?://[^\s|•]+|(?:www\.)[^\s|•]+)")


def extract_profile_from_file(filename: str, content: bytes, api_key: str | None = None) -> dict[str, object]:
    resume_text = extract_resume_text(filename, content)
    
    used_llm = False
    if api_key and api_key.strip():
        from services.ai_service import extract_full_profile_data
        llm_profile = extract_full_profile_data(resume_text, api_key.strip())
        if llm_profile is not None:
            profile = llm_profile
            used_llm = True
        else:
            profile = extract_profile_from_text(resume_text, filename=filename)
    else:
        profile = extract_profile_from_text(resume_text, filename=filename)
        
    detected_fields = [field for field, value in profile.items() if isinstance(value, str) and value.strip()]
    return {
        "profile": profile,
        "detected_fields": detected_fields,
        "source_filename": filename,
        "text_preview": resume_text[:400],
        "full_text": resume_text,
        "used_llm": used_llm,
    }


def extract_resume_text(filename: str, content: bytes) -> str:
    extension = Path(filename or "").suffix.lower()

    if extension not in SUPPORTED_IMPORT_EXTENSIONS:
        raise ValueError("Unsupported file type. Use PDF, DOCX, TXT, or MD.")

    if extension == ".pdf":
        return _extract_pdf_text(content)
    if extension == ".docx":
        return _extract_docx_text(content)
    return _extract_plain_text(content)


def extract_profile_from_text(text: str, filename: str = "") -> dict[str, str]:
    normalized_text = _normalize_resume_text(text)
    lines = _normalized_lines(normalized_text)
    sections = _extract_sections(lines)

    links = _extract_links(normalized_text)
    top_lines = lines[:8]

    profile = {
        "fullName": _extract_full_name(top_lines) or _fallback_name_from_filename(filename),
        "email": _first_match(_EMAIL_PATTERN, normalized_text),
        "phone": _clean_phone(_first_match(_PHONE_PATTERN, normalized_text)),
        "location": _extract_location(top_lines, normalized_text),
        "jobTitle": _extract_job_title(top_lines),
        "summary": _extract_summary(sections, lines),
        "experience": _extract_experience(sections),
        "skills": _extract_skills(sections),
        "website": links["website"],
        "linkedin": links["linkedin"],
        "github": links["github"],
    }

    cleaned_profile: dict[str, str] = {}
    for field, value in profile.items():
        if field == "experience":
            cleaned_profile[field] = _clean_multiline_text(value)
        else:
            cleaned_profile[field] = clean_text(value)

    return cleaned_profile


def _extract_pdf_text(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF import is unavailable because pypdf is not installed.") from exc

    reader = PdfReader(io.BytesIO(content))
    pages = [page.extract_text() or "" for page in reader.pages]
    extracted = "\n".join(pages)
    if not clean_text(extracted):
        raise ValueError("We could not extract readable text from this PDF.")
    return extracted


def _extract_docx_text(content: bytes) -> str:
    from docx import Document

    document = Document(io.BytesIO(content))
    paragraphs = [paragraph.text for paragraph in document.paragraphs if clean_text(paragraph.text)]
    extracted = "\n".join(paragraphs)
    if not clean_text(extracted):
        raise ValueError("We could not extract readable text from this DOCX file.")
    return extracted


def _extract_plain_text(content: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            text = content.decode(encoding)
            if clean_text(text):
                return text
        except UnicodeDecodeError:
            continue
    raise ValueError("We could not read text from this file.")


def _normalize_resume_text(text: str) -> str:
    normalized = text.replace("\r", "\n").replace("\t", " ")
    normalized = re.sub(r"[ \u00a0]+", " ", normalized)
    normalized = normalized.replace("•", "\n• ")
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _normalized_lines(text: str) -> list[str]:
    return [clean_text(line) for line in text.splitlines() if clean_text(line)]


def _extract_sections(lines: list[str]) -> dict[str, list[str]]:
    sections: dict[str, list[str]] = {}
    current_section: str | None = None

    for line in lines:
        section_name = _detect_heading(line)
        if section_name:
            current_section = section_name
            sections.setdefault(section_name, [])
            continue

        if current_section:
            sections[current_section].append(line)

    return sections


def _detect_heading(line: str) -> str | None:
    normalized = _normalize_heading(line)
    for section_name, aliases in _SECTION_ALIASES.items():
        if normalized in {_normalize_heading(alias) for alias in aliases}:
            return section_name
    return None


def _normalize_heading(text: str) -> str:
    return re.sub(r"[^a-z]+", " ", text.lower()).strip()


def _extract_full_name(top_lines: list[str]) -> str:
    for line in top_lines:
        if _is_contact_line(line) or _detect_heading(line):
            continue
        words = line.split()
        if 2 <= len(words) <= 4 and all(re.fullmatch(r"[A-Za-z][A-Za-z'.-]*", word) for word in words):
            return " ".join(word.capitalize() if word.isupper() else word for word in words)
    return ""


def _fallback_name_from_filename(filename: str) -> str:
    stem = Path(filename or "").stem
    cleaned = re.sub(r"[_-]+", " ", stem)
    cleaned = re.sub(r"\bresume\b", "", cleaned, flags=re.IGNORECASE)
    return clean_text(cleaned).title()


def _extract_job_title(top_lines: list[str]) -> str:
    for line in top_lines[1:6]:
        if _is_contact_line(line) or _looks_like_location(line) or _detect_heading(line):
            continue
        word_count = len(line.split())
        if 2 <= word_count <= 8:
            return line
    return ""


def _extract_location(top_lines: list[str], text: str) -> str:
    for line in top_lines:
        if _looks_like_location(line):
            return _LOCATION_PATTERN.search(line).group(0)  # type: ignore[union-attr]

    match = _LOCATION_PATTERN.search(text)
    return match.group(0) if match else ""


def _extract_summary(sections: dict[str, list[str]], lines: list[str]) -> str:
    if sections.get("summary"):
        return " ".join(sections["summary"][:4])

    for line in lines[:14]:
        if _is_contact_line(line) or _detect_heading(line):
            continue
        if len(line.split()) >= 12:
            return line
    return ""


def _extract_experience(sections: dict[str, list[str]]) -> str:
    if not sections.get("experience"):
        return ""

    experience_lines: list[str] = []
    for line in sections["experience"][:18]:
        if _detect_heading(line):
            break
        experience_lines.append(line)

    return "\n".join(experience_lines[:12])


def _extract_skills(sections: dict[str, list[str]]) -> str:
    if not sections.get("skills"):
        return ""

    raw_skills = " ".join(sections["skills"][:6])
    parts = re.split(r"[,|/•]\s*|\s{2,}", raw_skills)
    deduped: list[str] = []
    seen: set[str] = set()

    for part in parts:
        cleaned = clean_text(part)
        if not cleaned or len(cleaned) < 2:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(cleaned)

    return ", ".join(deduped[:12])


def _extract_links(text: str) -> dict[str, str]:
    links = {"website": "", "linkedin": "", "github": ""}

    for match in _LINK_PATTERN.findall(text):
        url = match if match.startswith("http") else f"https://{match}"
        lowered = url.lower()
        if "linkedin.com" in lowered and not links["linkedin"]:
            links["linkedin"] = url
        elif "github.com" in lowered and not links["github"]:
            links["github"] = url
        elif not links["website"]:
            links["website"] = url

    return links


def _is_contact_line(line: str) -> bool:
    lowered = line.lower()
    return bool(
        _EMAIL_PATTERN.search(line)
        or _PHONE_PATTERN.search(line)
        or _LINK_PATTERN.search(line)
        or "linkedin" in lowered
        or "github" in lowered
        or "|" in line
        or "·" in line
    )


def _looks_like_location(line: str) -> bool:
    return bool(_LOCATION_PATTERN.search(line))


def _clean_phone(value: str) -> str:
    phone = clean_text(value)
    if not phone:
        return ""
    return re.sub(r"\s{2,}", " ", phone)


def _clean_multiline_text(value: str) -> str:
    return "\n".join(clean_text(line) for line in value.splitlines() if clean_text(line))


def _first_match(pattern: re.Pattern[str], text: str) -> str:
    match = pattern.search(text)
    return match.group(0) if match else ""
