import React from "react";

function relativeTime(value) {
  if (!value) {
    return "Just now";
  }

  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);
  if (days < 7) {
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const weeks = Math.round(days / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
}

export default function ResumeCard({ resume, onOpen, selected, onToggleSelect }) {
  const scoreClass =
    resume.ats_score >= 80
      ? "resume-card__score resume-card__score--good"
      : resume.ats_score >= 65
        ? "resume-card__score resume-card__score--warn"
        : "resume-card__score resume-card__score--bad";

  return (
    <article
      className={`resume-card ${selected ? "resume-card--selected" : ""}`}
      onClick={() => onOpen(resume.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(resume.id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <span className="resume-card__shine" aria-hidden="true" />
      <button
        aria-label={selected ? "Deselect resume" : "Select resume"}
        className={`resume-card__select ${selected ? "resume-card__select--checked" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleSelect(resume.id);
        }}
        type="button"
      >
        {selected ? "✓" : ""}
      </button>
      <div className="resume-card__copy">
        <h3 title={resume.title}>{resume.title}</h3>
        <p>{resume.template === "modern" ? "Modern" : "Classic"}</p>
      </div>

      <div className="resume-card__preview" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="resume-card__meta">
        <span>{relativeTime(resume.last_updated)}</span>
        <span className={scoreClass}>ATS {resume.ats_score}</span>
      </div>
    </article>
  );
}
