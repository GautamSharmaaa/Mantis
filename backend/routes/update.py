from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from models.resume_model import Resume
from services.ai_service import chat_edit, get_experience, get_project, improve_bullet
from services.resume_service import update_experience_bullet, update_project_bullet

router = APIRouter(tags=["update"])


class UpdateBulletRequest(BaseModel):
    resume: Resume
    exp_index: int | None = Field(default=None, ge=0)
    proj_index: int | None = Field(default=None, ge=0)
    bullet_index: int = Field(..., ge=0)
    job_description: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)
    instruction: str | None = None
    section: Literal["experience", "project"] = "experience"
    experience_level: str = "Intermediate"
    target_role: str = ""


@router.post("/update-bullet")
def update_bullet(payload: UpdateBulletRequest) -> dict[str, object]:
    current_bullet, apply_bullet_update = _resolve_bullet_target(payload)

    improved_bullet = (
        chat_edit(
            instruction=payload.instruction,
            selected_text=current_bullet,
            jd=payload.job_description,
            api_key=payload.api_key,
            experience_level=payload.experience_level,
            target_role=payload.target_role,
        )
        if payload.instruction
        else improve_bullet(
            bullet=current_bullet,
            jd=payload.job_description,
            api_key=payload.api_key,
            experience_level=payload.experience_level,
            target_role=payload.target_role,
        )
    )
    updated_resume = apply_bullet_update(improved_bullet)
    return _success(updated_resume.model_dump(mode="json"))


def _success(data: object) -> dict[str, object]:
    return {"success": True, "data": data}


def _resolve_bullet_target(payload: UpdateBulletRequest):
    if payload.section == "project":
        project = get_project(payload.resume, payload.proj_index)
        if payload.bullet_index >= len(project.points):
            raise HTTPException(status_code=400, detail="Project bullet index is out of range.")
        current_bullet = project.points[payload.bullet_index]
        return current_bullet, lambda new_text: update_project_bullet(
            payload.resume,
            payload.proj_index,
            payload.bullet_index,
            new_text,
        )

    experience = get_experience(payload.resume, payload.exp_index)
    if payload.bullet_index >= len(experience.points):
        raise HTTPException(status_code=400, detail="Bullet index is out of range.")
    current_bullet = experience.points[payload.bullet_index]
    return current_bullet, lambda new_text: update_experience_bullet(
        payload.resume,
        payload.exp_index,
        payload.bullet_index,
        new_text,
    )
