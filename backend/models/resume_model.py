from __future__ import annotations

import re
from datetime import date, datetime, timezone
from enum import Enum
from typing import Annotated, Optional
from uuid import uuid4

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)

# ---------------- ENUMS ---------------- #

class ProficiencyLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"


class EmploymentType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    INTERNSHIP = "internship"


class TemplateStyle(str, Enum):
    CLASSIC = "classic"
    MODERN = "modern"


class ResumeStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"


# ---------------- HELPERS ---------------- #

NonEmptyStr = Annotated[str, Field(min_length=1)]
OptionalUrl = Optional[AnyHttpUrl]


def _clean(v: str, name="Field"):
    if v is None or not v.strip():
        raise ValueError(f"{name} cannot be empty")
    return v.strip()


# ---------------- DATE RANGE ---------------- #

class DateRange(BaseModel):
    start_date: date
    end_date: Optional[date] = None

    @model_validator(mode="after")
    def validate(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Invalid date range")
        return self


# ---------------- CONTACT ---------------- #

class ContactInfo(BaseModel):
    email: EmailStr
    phone: str = ""

    @field_validator("phone")
    def validate_phone(cls, v):
        if v and not re.fullmatch(r"[\d\s\-\+\(\)]+", v):
            raise ValueError("Invalid phone")
        return v


# ---------------- PERSONAL ---------------- #

class PersonalInfo(BaseModel):
    full_name: NonEmptyStr
    contact: ContactInfo
    date_of_birth: Optional[date] = None


# ---------------- EXPERIENCE ---------------- #

class ExperienceItem(BaseModel):
    role: NonEmptyStr = "New Experience"
    company: NonEmptyStr = "Company"
    duration: str = ""
    points: list[str] = []


# ---------------- EDUCATION ---------------- #

class EducationItem(BaseModel):
    institution: NonEmptyStr = "Institution"
    degree: str = ""
    duration: str = ""
    points: list[str] = []


# ---------------- PROJECT ---------------- #

class ProjectItem(BaseModel):
    name: NonEmptyStr = "New Project"
    duration: str = ""
    url: str = ""
    points: list[str] = []


# ---------------- CERTIFICATION ---------------- #

class CertificationItem(BaseModel):
    name: NonEmptyStr
    issue_date: date
    expiry_date: Optional[date] = None


# ---------------- PUBLICATION ---------------- #

class PublicationItem(BaseModel):
    title: NonEmptyStr
    publication_date: Optional[date] = None


# ---------------- AWARD ---------------- #

class AwardItem(BaseModel):
    title: NonEmptyStr
    date: Optional[date] = None


# ---------------- DATA ---------------- #

class ResumeData(BaseModel):
    summary: str = ""
    personal_info: Optional[PersonalInfo] = None
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    projects: list[ProjectItem] = []
    certifications: list[CertificationItem] = []
    publications: list[PublicationItem] = []
    awards: list[AwardItem] = []
    skills: list[str] = []


# ---------------- META ---------------- #

class ResumeMeta(BaseModel):
    visibility: ResumeStatus = ResumeStatus.DRAFT


# ---------------- AUDIT ---------------- #

class AuditInfo(BaseModel):
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------- MAIN MODEL ---------------- #

class Resume(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str = "My Resume"
    template: str = "classic"
    
    ats_score: int = 0
    last_updated: Optional[str] = None
    accent_color: Optional[str] = None

    meta: ResumeMeta = Field(default_factory=ResumeMeta)
    audit: AuditInfo = Field(default_factory=AuditInfo)
    data: ResumeData = Field(default_factory=ResumeData)

    @property
    def is_complete(self):
        return bool(self.data.personal_info and self.data.experience)