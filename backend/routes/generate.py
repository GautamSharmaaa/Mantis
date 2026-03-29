from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from models.resume_model import Resume
from services.ai_service import generate_initial_resume
from services.resume_service import create_empty_resume

router = APIRouter(tags=["generate"])


class GenerateRequest(BaseModel):
    resume_text: str = Field(..., min_length=1)
    job_description: str = ""
    api_key: str = Field(..., min_length=1)
    title: str = Field(..., min_length=1)
    template: str = Field(..., min_length=1)


@router.post("/generate")
def generate_resume(payload: GenerateRequest) -> dict[str, object]:
    generated_resume = generate_initial_resume(
        resume_text=payload.resume_text,
        jd=payload.job_description,
        api_key=payload.api_key,
    )

    resume = create_empty_resume(payload.title, payload.template)
    resume.data = generated_resume.data
    
    from services.ats_service import calculate_ats_score
    score_data = calculate_ats_score(resume, jd=payload.job_description)
    resume.ats_score = score_data.get("score", 0)
    
    return _success(resume.model_dump(mode="json"))


def _success(data: object) -> dict[str, object]:
    return {"success": True, "data": data}
