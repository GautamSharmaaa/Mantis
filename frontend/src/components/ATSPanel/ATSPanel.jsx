import React, { memo, useState } from "react";

const ATSPanel = memo(function ATSPanel({
  scoreData,
  isLoading,
  scoreDelta,
  jobDescription,
  onManualCheck,
  onPowerGenerate,
  isPowerLoading,
}) {
  const [expanded, setExpanded] = useState(null);
  const score = scoreData.score || 0;
  const grade = scoreData.grade || {};
  const sectionResults = scoreData.section_results || [];
  const suggestions = scoreData.suggestions || [];
  const weakWords = (scoreData.weak_words_used || []).slice(0, 5);
  const missingKeywords = (scoreData.missing_keywords || []).slice(0, 8);
  const matchedKeywords = (scoreData.matched_keywords || []).slice(0, 8);
  const criticalIssues = scoreData.critical_issues || 0;
  const hasJobTarget = Boolean(jobDescription.trim());

  const scoreTone =
    score >= 85 ? "strong" : score >= 70 ? "solid" : score >= 50 ? "weak" : "poor";

  const toggleSection = (id) => setExpanded(expanded === id ? null : id);

  return (
    <section className="ats-dock">
      {/* ── Score Header ──────────────────────────── */}
      <div className="ats-dock__score">
        <div className={`ats-dock__ring ats-dock__ring--${scoreTone}`}>
          <span>{isLoading ? "…" : score}</span>
        </div>
        <div className="ats-dock__score-meta">
          <strong>{grade.grade || "–"} · {grade.label || "ATS Score"}</strong>
          <p>
            {hasJobTarget
              ? scoreDelta > 0
                ? `↗ +${scoreDelta} from last edit`
                : criticalIssues > 0
                ? `${criticalIssues} critical issue${criticalIssues > 1 ? "s" : ""}`
                : grade.label || "Analyzing..."
              : "Add a job target for live scoring"}
          </p>
        </div>
        <button
          className={`ats-dock__check-btn ${isLoading ? "ats-dock__check-btn--loading" : ""}`}
          onClick={onManualCheck}
          disabled={isLoading}
          type="button"
        >
          {isLoading ? "…" : "↻ Check"}
        </button>
      </div>

      {/* ── Section Breakdown ─────────────────────── */}
      <div className="ats-dock__sections">
        {sectionResults.map((sec) => {
          const tone = sec.percentageScore >= 75 ? "strong" : sec.percentageScore >= 50 ? "weak" : "poor";
          const isOpen = expanded === sec.sectionId;
          return (
            <div key={sec.sectionId} className={`ats-section ${isOpen ? "ats-section--open" : ""}`}>
              <button className="ats-section__header" onClick={() => toggleSection(sec.sectionId)} type="button">
                <span className="ats-section__name">{sec.name}</span>
                <div className="ats-section__bar">
                  <i className={`ats-section__fill ats-section__fill--${tone}`} style={{ width: `${Math.max(4, sec.percentageScore)}%` }} />
                </div>
                <strong className={`ats-section__pct ats-section__pct--${tone}`}>{sec.percentageScore}%</strong>
                <span className="ats-section__chevron">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && sec.checks && sec.checks.length > 0 && (
                <div className="ats-section__checks">
                  {sec.checks.map((c) => (
                    <div key={c.id} className={`ats-check ${c.passed ? "ats-check--pass" : "ats-check--fail"}`}>
                      <span className="ats-check__icon">{c.passed ? "✓" : "✗"}</span>
                      <div>
                        <strong>{c.label}</strong>
                        <p>{c.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Suggestions ───────────────────────────── */}
      {suggestions.length > 0 && (
        <div className="ats-dock__suggestions">
          <span>💡 AI Suggestions</span>
          <div className="ats-dock__suggestion-list">
            {suggestions.slice(0, 5).map((s, i) => (
              <div key={i} className={`ats-suggestion ats-suggestion--${s.priority || "medium"}`}>
                <span className="ats-suggestion__badge">{s.section}</span>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Weak Phrases ──────────────────────────── */}
      {weakWords.length > 0 && (
        <div className="ats-dock__weak-words">
          <span>⚠ Weak Phrases</span>
          <div className="ats-dock__keyword-list">
            {weakWords.map((word) => (
              <em key={word} className="ats-dock__keyword-weak">{word}</em>
            ))}
          </div>
        </div>
      )}

      {/* ── Keywords ──────────────────────────────── */}
      {matchedKeywords.length > 0 && (
        <div className="ats-dock__matched">
          <span>✓ Matched Keywords</span>
          <div className="ats-dock__keyword-list">
            {matchedKeywords.map((k) => <em key={k} className="ats-dock__keyword-matched">{k}</em>)}
          </div>
        </div>
      )}

      <div className="ats-dock__keywords">
        <span>⚠ Missing Keywords</span>
        <div className="ats-dock__keyword-list">
          {missingKeywords.length ? (
            missingKeywords.map((keyword) => <em key={keyword}>{keyword}</em>)
          ) : (
            <em className="ats-dock__keyword-empty">
              {hasJobTarget ? "No major gaps" : "Waiting for job target"}
            </em>
          )}
        </div>
      </div>

      {/* ── Power Button ──────────────────────────── */}
      <button
        className={`ats-dock__power-btn ${isPowerLoading ? "ats-dock__power-btn--loading" : ""}`}
        onClick={onPowerGenerate}
        disabled={isPowerLoading || isLoading}
        type="button"
      >
        <span className="ats-dock__power-icon">⚡</span>
        {isPowerLoading ? "Generating Perfect Resume..." : "Power Generate — ATS 100"}
      </button>
    </section>
  );
});

export default ATSPanel;
