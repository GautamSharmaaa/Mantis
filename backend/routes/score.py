from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from models.resume_model import Resume
from services.ats_service import calculate_ats_score, extract_keywords, resume_to_text

router = APIRouter(tags=["score"])


class ScoreRequest(BaseModel):
    resume: Resume
    job_description: str = ""


@router.post("/score")
def score_resume(payload: ScoreRequest) -> dict[str, object]:
    resume_text = resume_to_text(payload.resume)
    keyword_data = extract_keywords(payload.job_description) if payload.job_description else {}
    score_data = calculate_ats_score(
        payload.resume,
        payload.job_description,
        resume_text=resume_text,
        keyword_data=keyword_data,
    )
    return _success(score_data)


def _success(data: object) -> dict[str, object]:
    return {"success": True, "data": data}
