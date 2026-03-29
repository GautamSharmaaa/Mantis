from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from models.resume_model import Resume
from services.export_service import (
    build_export_filename,
    generate_docx_bytes,
    generate_pdf_bytes,
)

router = APIRouter(tags=["export"])


class ExportProfile(BaseModel):
    fullName: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    jobTitle: str = ""
    website: str = ""
    linkedin: str = ""
    github: str = ""


class ExportRequest(BaseModel):
    resume: Resume
    profile: ExportProfile | None = Field(default=None)


@router.post("/download-docx")
def download_docx(payload: ExportRequest) -> StreamingResponse:
    file_bytes = generate_docx_bytes(payload.resume, payload.profile.model_dump() if payload.profile else None)
    filename = build_export_filename(payload.resume, "docx")
    return _file_response(
        file_bytes=file_bytes,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/download-pdf")
def download_pdf(payload: ExportRequest) -> StreamingResponse:
    file_bytes = generate_pdf_bytes(payload.resume, payload.profile.model_dump() if payload.profile else None)
    filename = build_export_filename(payload.resume, "pdf")
    return _file_response(
        file_bytes=file_bytes,
        filename=filename,
        media_type="application/pdf",
    )


def _file_response(file_bytes: bytes, filename: str, media_type: str) -> StreamingResponse:
    response = StreamingResponse(iter([file_bytes]), media_type=media_type)
    response.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response
