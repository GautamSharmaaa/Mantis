from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from models.resume_model import Resume
from services.ai_service import optimize_full_resume, power_generate, get_ai_suggestions
from services.ats_service import calculate_ats_score, resume_to_text, extract_keywords

router = APIRouter(tags=["optimize"])


class OptimizeRequest(BaseModel):
    resume: Resume
    job_description: str = ""
    profile: dict = {}
    api_key: str
    experience_level: str = "Intermediate"
    target_role: str = ""


class PowerGenerateRequest(BaseModel):
    resume: Resume
    job_description: str = ""
    profile: dict = {}
    api_key: str
    experience_level: str = "Intermediate"
    target_role: str = ""


class AiSuggestionsRequest(BaseModel):
    resume: Resume
    job_description: str
    api_key: str
    experience_level: str = "Intermediate"
    target_role: str = ""


@router.post("/optimize-resume")
def optimize_resume(payload: OptimizeRequest) -> dict[str, object]:
    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required for full resume optimization.")

    resume_data = payload.resume.data.model_dump(mode="json")
    optimized = optimize_full_resume(
        resume_data=resume_data,
        jd=payload.job_description,
        profile=payload.profile,
        api_key=payload.api_key,
        experience_level=payload.experience_level,
        target_role=payload.target_role,
    )
    if optimized is None:
        raise HTTPException(status_code=500, detail="Optimization failed. Try again or check your API key.")
    return {"success": True, "data": optimized}


@router.post("/power-generate")
def power_gen(payload: PowerGenerateRequest) -> dict[str, object]:
    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required.")

    resume_data = payload.resume.data.model_dump(mode="json")

    # Run ATS scoring first so the LLM knows exactly what to fix
    ats_report: dict = {}
    effective_jd = payload.job_description.strip() or payload.target_role
    if effective_jd:
        try:
            resume_text = resume_to_text(payload.resume)
            keyword_data = extract_keywords(effective_jd)
            ats_report = calculate_ats_score(
                payload.resume, effective_jd,
                resume_text=resume_text, keyword_data=keyword_data,
            )
        except Exception:  # noqa: BLE001 — scoring is best-effort
            ats_report = {}

    result = power_generate(
        resume_data=resume_data,
        jd=payload.job_description,
        profile=payload.profile,
        api_key=payload.api_key,
        experience_level=payload.experience_level,
        target_role=payload.target_role,
        ats_report=ats_report,
    )
    if result is None:
        raise HTTPException(status_code=500, detail="Power generation failed. Check your API key.")
    return {"success": True, "data": result}


@router.post("/ai-suggestions")
def ai_suggestions(payload: AiSuggestionsRequest) -> dict[str, object]:
    if not payload.api_key.strip():
        raise HTTPException(status_code=400, detail="API key is required.")

    resume_data = payload.resume.data.model_dump(mode="json")
    resume_text = resume_to_text(payload.resume)
    keyword_data = extract_keywords(payload.job_description)

    ats_report = calculate_ats_score(
        payload.resume, payload.job_description,
        resume_text=resume_text, keyword_data=keyword_data,
    )

    suggestions = get_ai_suggestions(
        resume_data=resume_data,
        jd=payload.job_description,
        ats_report=ats_report,
        api_key=payload.api_key,
        experience_level=payload.experience_level,
        target_role=payload.target_role,
    )

    return {"success": True, "data": {"suggestions": suggestions, "ats": ats_report}}
