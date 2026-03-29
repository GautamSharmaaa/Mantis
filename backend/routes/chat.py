from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from models.resume_model import Resume
from services.ai_service import chat_edit

router = APIRouter(tags=["chat"])


class ChatRequest(BaseModel):
    resume: Resume
    instruction: str = Field(..., min_length=1)
    selected_text: str = Field(..., min_length=1)
    job_description: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)
    experience_level: str = "Intermediate"
    target_role: str = ""


@router.post("/chat")
def chat(payload: ChatRequest) -> dict[str, object]:
    updated_text = chat_edit(
        instruction=payload.instruction,
        selected_text=payload.selected_text,
        jd=payload.job_description,
        api_key=payload.api_key,
        experience_level=payload.experience_level,
        target_role=payload.target_role,
    )
    return _success({"updated_text": updated_text})


def _success(data: object) -> dict[str, object]:
    return {"success": True, "data": data}
