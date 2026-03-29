from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from models.resume_model import Resume
from services.profile_import_service import extract_profile_from_file

router = APIRouter(tags=["profile"])


@router.post("/import-profile")
async def import_profile(
    file: UploadFile = File(...),
    api_key: str | None = Form(None),
) -> dict[str, object]:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A resume file is required.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        result = extract_profile_from_file(file.filename, content, api_key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return _success(result)


class SyncProfileRequest(BaseModel):
    resume: Resume
    profile: dict = {}
    api_key: str


@router.post("/sync-profile")
async def sync_profile(payload: SyncProfileRequest) -> dict[str, object]:
    from services.ai_service import sync_profile_into_resume

    api_key = payload.api_key.strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="API key is required for sync.")

    resume_data = payload.resume.data.model_dump(mode="json")

    new_data = sync_profile_into_resume(payload.profile, resume_data, api_key)
    if new_data is None:
        raise HTTPException(status_code=500, detail="Failed to sync profile data. Check your API key and try again.")

    return _success(new_data)


def _success(data: object) -> dict[str, object]:
    return {"success": True, "data": data}
