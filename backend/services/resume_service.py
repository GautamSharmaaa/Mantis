from __future__ import annotations

"""
Resume lifecycle
1. User creates a resume via `create_empty_resume`.
2. The resume is represented as structured JSON via the `Resume` model.
3. Focused service functions mutate specific sections or bullets only.
4. Only the targeted field changes; the full resume is never replaced.
5. `update_timestamp` runs after every mutation to preserve lifecycle metadata.
6. ATS score recalculation is intentionally deferred to a deterministic later step.
7. All public functions are fully typed, documented, and emit structured audit events.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import wraps
from typing import Any, TypeVar

from models.resume_model import ExperienceItem, ProjectItem, Resume
from utils.helpers import current_timestamp, generate_uuid
from utils.text_utils import clean_text, validate_bullet_length

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Audit trail
# ---------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class AuditEvent:
    """Immutable record of a single resume mutation."""

    operation: str
    resume_id: str
    payload: dict[str, Any]
    timestamp: str = field(default_factory=current_timestamp)


_audit_log: list[AuditEvent] = []


def get_audit_log(resume_id: str | None = None) -> list[AuditEvent]:
    """Return all audit events, optionally filtered by *resume_id*."""
    if resume_id is None:
        return list(_audit_log)
    return [e for e in _audit_log if e.resume_id == resume_id]


def _record(operation: str, resume: Resume, **payload: Any) -> None:
    _audit_log.append(AuditEvent(operation=operation, resume_id=resume.id, payload=payload))


# ---------------------------------------------------------------------------
# Decorator: mutation guard
# ---------------------------------------------------------------------------

F = TypeVar("F", bound=Callable[..., Resume])


def _mutates(operation: str) -> Callable[[F], F]:
    """
    Decorator that:
    - Validates the first positional argument is a non-None ``Resume``.
    - Calls ``update_timestamp`` after a successful mutation.
    - Records an audit event.
    - Logs the operation at DEBUG level.
    """
    def decorator(fn: F) -> F:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Resume:
            # First positional arg is always `resume`
            resume_arg = args[0] if args else kwargs.get("resume")
            _require_resume(resume_arg)

            result: Resume = fn(*args, **kwargs)
            result = update_timestamp(result)
            _record(operation, result, **{k: v for k, v in kwargs.items() if k != "resume"})
            logger.debug("resume.%s id=%s", operation, result.id)
            return result

        return wrapper  # type: ignore[return-value]

    return decorator


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def create_empty_resume(title: str, template: str) -> Resume:
    """
    Create and return a new, empty ``Resume`` with the given *title* and *template*.

    Args:
        title:    Human-readable document title.
        template: Identifier for the visual template to apply.

    Returns:
        A fully initialised ``Resume`` with a generated UUID and zero ATS score.

    Raises:
        ValueError: If *title* or *template* is empty or whitespace-only.
    """
    resume = Resume(
        id=generate_uuid(),
        title=_require_non_empty_text(title, "title"),
        template=_require_non_empty_text(template, "template"),
        ats_score=0.0,
        last_updated=current_timestamp(),
    )
    _record("create", resume, title=resume.title, template=resume.template)
    logger.debug("resume.create id=%s title=%r template=%r", resume.id, resume.title, resume.template)
    return resume


@_mutates("update_summary")
def update_summary(resume: Resume, new_summary: str) -> Resume:
    """
    Replace the professional summary section.

    Args:
        resume:      Target resume.
        new_summary: Replacement summary text (whitespace is collapsed).

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *new_summary* is ``None``.
    """
    if new_summary is None:
        raise ValueError("Summary cannot be null.")
    resume.data.summary = clean_text(new_summary)
    return resume


@_mutates("add_experience")
def add_experience(resume: Resume, role: str, company: str) -> Resume:
    """
    Append a new, empty experience entry.

    Args:
        resume:  Target resume.
        role:    Job title / role name.
        company: Employer name.

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *role* or *company* is empty.
    """
    resume.data.experience.append(
        ExperienceItem(
            role=_require_non_empty_text(role, "role"),
            company=_require_non_empty_text(company, "company"),
        )
    )
    return resume


@_mutates("add_experience_bullet")
def add_experience_bullet(resume: Resume, exp_index: int, bullet_text: str) -> Resume:
    """
    Append a bullet point to an existing experience entry.

    Args:
        resume:      Target resume.
        exp_index:   Zero-based index of the experience entry.
        bullet_text: New bullet text (must be 5–25 words).

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError:  If *bullet_text* is empty or out of word-count range.
        IndexError:  If *exp_index* is out of bounds.
    """
    experience = _get_item_by_index(resume.data.experience, exp_index, "experience entry")
    experience.points.append(_prepare_bullet_text(bullet_text))
    return resume


@_mutates("update_experience_bullet")
def update_experience_bullet(
    resume: Resume,
    exp_index: int,
    bullet_index: int,
    new_text: str,
) -> Resume:
    """
    Replace a specific bullet within an experience entry.

    Args:
        resume:       Target resume.
        exp_index:    Zero-based index of the experience entry.
        bullet_index: Zero-based index of the bullet point to replace.
        new_text:     Replacement text (must be 5–25 words).

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *new_text* is invalid.
        IndexError: If either index is out of bounds.
    """
    experience = _get_item_by_index(resume.data.experience, exp_index, "experience entry")
    _validate_bullet_index(experience.points, bullet_index, "experience bullet")
    experience.points[bullet_index] = _prepare_bullet_text(new_text)
    return resume


@_mutates("remove_experience_bullet")
def remove_experience_bullet(resume: Resume, exp_index: int, bullet_index: int) -> Resume:
    """
    Delete a specific bullet from an experience entry.

    Args:
        resume:       Target resume.
        exp_index:    Zero-based index of the experience entry.
        bullet_index: Zero-based index of the bullet to remove.

    Returns:
        The mutated ``Resume``.

    Raises:
        IndexError: If either index is out of bounds.
    """
    experience = _get_item_by_index(resume.data.experience, exp_index, "experience entry")
    _validate_bullet_index(experience.points, bullet_index, "experience bullet")
    experience.points.pop(bullet_index)
    return resume


@_mutates("reorder_experience_bullets")
def reorder_experience_bullets(
    resume: Resume,
    exp_index: int,
    new_order: list[int],
) -> Resume:
    """
    Reorder the bullets of an experience entry according to *new_order*.

    *new_order* must be a permutation of ``range(len(experience.points))``.

    Args:
        resume:    Target resume.
        exp_index: Zero-based index of the experience entry.
        new_order: Desired ordering expressed as a list of current indices.

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *new_order* is not a valid permutation.
        IndexError: If *exp_index* is out of bounds.
    """
    experience = _get_item_by_index(resume.data.experience, exp_index, "experience entry")
    n = len(experience.points)
    if sorted(new_order) != list(range(n)):
        raise ValueError(
            f"new_order must be a permutation of range({n}), got {new_order}."
        )
    experience.points = [experience.points[i] for i in new_order]
    return resume


@_mutates("add_project")
def add_project(resume: Resume, name: str) -> Resume:
    """
    Append a new, empty project entry.

    Args:
        resume: Target resume.
        name:   Project display name.

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *name* is empty.
    """
    resume.data.projects.append(
        ProjectItem(name=_require_non_empty_text(name, "project name"))
    )
    return resume


@_mutates("add_project_bullet")
def add_project_bullet(resume: Resume, proj_index: int, bullet_text: str) -> Resume:
    """
    Append a bullet point to an existing project entry.

    Args:
        resume:      Target resume.
        proj_index:  Zero-based index of the project entry.
        bullet_text: New bullet text (must be 5–25 words).

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *bullet_text* is invalid.
        IndexError: If *proj_index* is out of bounds.
    """
    project = _get_item_by_index(resume.data.projects, proj_index, "project entry")
    project.points.append(_prepare_bullet_text(bullet_text))
    return resume


@_mutates("update_project_bullet")
def update_project_bullet(
    resume: Resume,
    proj_index: int,
    bullet_index: int,
    new_text: str,
) -> Resume:
    """
    Replace a specific bullet within a project entry.

    Args:
        resume:       Target resume.
        proj_index:   Zero-based index of the project entry.
        bullet_index: Zero-based index of the bullet point to replace.
        new_text:     Replacement text (must be 5–25 words).

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *new_text* is invalid.
        IndexError: If either index is out of bounds.
    """
    project = _get_item_by_index(resume.data.projects, proj_index, "project entry")
    _validate_bullet_index(project.points, bullet_index, "project bullet")
    project.points[bullet_index] = _prepare_bullet_text(new_text)
    return resume


@_mutates("remove_project_bullet")
def remove_project_bullet(resume: Resume, proj_index: int, bullet_index: int) -> Resume:
    """
    Delete a specific bullet from a project entry.

    Args:
        resume:       Target resume.
        proj_index:   Zero-based index of the project entry.
        bullet_index: Zero-based index of the bullet to remove.

    Returns:
        The mutated ``Resume``.

    Raises:
        IndexError: If either index is out of bounds.
    """
    project = _get_item_by_index(resume.data.projects, proj_index, "project entry")
    _validate_bullet_index(project.points, bullet_index, "project bullet")
    project.points.pop(bullet_index)
    return resume


@_mutates("update_skills")
def update_skills(resume: Resume, skills_list: list[str]) -> Resume:
    """
    Replace the entire skills list.

    Deduplication is case-insensitive; the first occurrence of each skill is
    preserved. Empty strings are silently dropped.

    Args:
        resume:      Target resume.
        skills_list: Replacement list of skill strings.

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError:  If *skills_list* is ``None``.
        TypeError:   If *skills_list* is not a ``list``.
    """
    if skills_list is None:
        raise ValueError("Skills list cannot be null.")
    if not isinstance(skills_list, list):
        raise TypeError("Skills input must be a list of strings.")

    seen: set[str] = set()
    cleaned: list[str] = []
    for skill in skills_list:
        value = clean_text(skill)
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(value)

    resume.data.skills = cleaned
    return resume


@_mutates("add_skill")
def add_skill(resume: Resume, skill: str) -> Resume:
    """
    Add a single skill if it does not already exist (case-insensitive).

    Args:
        resume: Target resume.
        skill:  Skill string to add.

    Returns:
        The mutated ``Resume``.

    Raises:
        ValueError: If *skill* is empty.
    """
    value = _require_non_empty_text(skill, "skill")
    existing_keys = {s.casefold() for s in resume.data.skills}
    if value.casefold() not in existing_keys:
        resume.data.skills.append(value)
    return resume


@_mutates("remove_skill")
def remove_skill(resume: Resume, skill: str) -> Resume:
    """
    Remove a skill by name (case-insensitive). No-op if not found.

    Args:
        resume: Target resume.
        skill:  Skill string to remove.

    Returns:
        The mutated ``Resume``.
    """
    target = clean_text(skill).casefold()
    resume.data.skills = [s for s in resume.data.skills if s.casefold() != target]
    return resume


def update_timestamp(resume: Resume) -> Resume:
    """
    Refresh ``resume.last_updated`` to the current UTC timestamp.

    This is called automatically by every ``@_mutates``-decorated function.
    Call it explicitly only if you need to touch the timestamp without any
    other change (e.g. when loading a resume from an external source).

    Args:
        resume: Target resume.

    Returns:
        The same ``Resume`` with a refreshed timestamp.
    """
    _require_resume(resume)
    resume.last_updated = current_timestamp()
    return resume


def clone_resume(resume: Resume, new_title: str) -> Resume:
    """
    Return a deep copy of *resume* under a fresh UUID and *new_title*.

    The clone starts with ``ats_score=0.0`` so that the score is recalculated
    independently from its source.

    Args:
        resume:    Source resume.
        new_title: Title for the cloned document.

    Returns:
        A new ``Resume`` that is structurally identical to the source.
    """
    import copy

    _require_resume(resume)
    cloned = copy.deepcopy(resume)
    cloned.id = generate_uuid()
    cloned.title = _require_non_empty_text(new_title, "new_title")
    cloned.ats_score = 0.0
    cloned.last_updated = current_timestamp()
    _record("clone", cloned, source_id=resume.id, new_title=cloned.title)
    logger.debug("resume.clone source=%s new=%s", resume.id, cloned.id)
    return cloned


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _require_resume(resume: Resume | None) -> Resume:
    if resume is None:
        raise ValueError("Resume cannot be null.")
    return resume


def _require_non_empty_text(value: str | None, field_name: str) -> str:
    if value is None:
        raise ValueError(f"{field_name.capitalize()} cannot be null.")
    cleaned = clean_text(value)
    if not cleaned:
        raise ValueError(f"{field_name.capitalize()} cannot be empty.")
    return cleaned


def _prepare_bullet_text(text: str | None) -> str:
    cleaned = _require_non_empty_text(text, "bullet text")
    if not validate_bullet_length(cleaned):
        raise ValueError("Bullet text must contain between 5 and 25 words.")
    return cleaned


def _get_item_by_index(items: list[Any], index: int | None, label: str) -> Any:
    if index is None:
        raise ValueError(f"{label.capitalize()} index cannot be null.")
    if not isinstance(index, int):
        raise TypeError(f"{label.capitalize()} index must be an integer, got {type(index).__name__}.")
    if index < 0 or index >= len(items):
        raise IndexError(
            f"{label.capitalize()} index {index} is out of range "
            f"(collection has {len(items)} item(s))."
        )
    return items[index]


def _validate_bullet_index(points: list[str], bullet_index: int | None, label: str) -> None:
    if bullet_index is None or bullet_index < 0 or bullet_index >= len(points):
        raise IndexError(
            f"{label.capitalize()} index {bullet_index!r} is out of range "
            f"(entry has {len(points)} bullet(s))."
        )