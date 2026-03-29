import React, { memo, useState } from "react";

const Chat = memo(function Chat({
  messages,
  selectionMeta,
  selectedText,
  jobDescription,
  onJobDescriptionChange,
  experienceLevel,
  onExperienceLevelChange,
  targetRole,
  onTargetRoleChange,
  onSend,
  onOptimizeAll,
  onManualAtsCheck,
  isLoading,
  isOptimizing,
  hasApiKey,
  statusMessage,
  atsScore,
  weakWords,
}) {
  const [input, setInput] = useState("");
  const hasSelection = Boolean(selectedText.trim());
  const hasJobTarget = Boolean(jobDescription.trim()) || Boolean(targetRole);
  const canSubmitEdits = hasSelection && hasJobTarget && hasApiKey && !isLoading;
  const canOptimize = hasApiKey && !isOptimizing && !isLoading;
  const jobWordCount = jobDescription.trim() ? jobDescription.trim().split(/\s+/).length : 0;
  const quickPrompts = selectedText
    ? [
        "Make this more concise",
        "Add stronger impact language",
        "Tailor this for the job description",
      ]
    : [
        "What should I improve first?",
        "Which section is weakest?",
        "How can I improve ATS match?",
      ];

  const handleSubmit = async (event) => {
    event.preventDefault();
    const submitted = input.trim();
    if (!submitted) {
      return;
    }

    const wasSent = await onSend(submitted);
    if (wasSent) {
      setInput("");
      }
    };

  const handleQuickPrompt = async (prompt) => {
    if (!canSubmitEdits) {
      return;
    }
    const wasSent = await onSend(prompt);
    if (wasSent) {
      setInput("");
    }
  };

  const scoreTone =
    atsScore >= 85 ? "strong" : atsScore >= 70 ? "solid" : atsScore >= 50 ? "weak" : "poor";

  return (
    <aside className="assistant-panel">
      <div className="assistant-panel__header">
        <span className="assistant-panel__spark">✦</span>
        <h2>AI Assistant</h2>
        <div className="assistant-panel__header-right">
          {atsScore > 0 && (
            <span className={`assistant-panel__ats-badge assistant-panel__ats-badge--${scoreTone}`}>
              ATS {atsScore}
            </span>
          )}
          <span className={`assistant-panel__state ${isLoading || isOptimizing ? "assistant-panel__state--busy" : ""}`}>
            {isOptimizing ? "Optimizing…" : isLoading ? "Working" : "Ready"}
          </span>
        </div>
      </div>

      <button
        className={`assistant-panel__optimize-btn ${isOptimizing ? "assistant-panel__optimize-btn--loading" : ""}`}
        onClick={onOptimizeAll}
        disabled={!canOptimize}
        type="button"
      >
        {isOptimizing
          ? "⟳ Optimizing entire resume…"
          : hasJobTarget
          ? "✦ Optimize All — Target JD"
          : "✦ Optimize All — Based on Profile"}
      </button>

      {weakWords && weakWords.length > 0 && (
        <div className="assistant-panel__weak-words">
          <span>Weak phrases detected:</span>
          <div className="assistant-panel__weak-tags">
            {weakWords.map((w) => (
              <em key={w}>{w}</em>
            ))}
          </div>
        </div>
      )}

      {selectedText ? (
        <div className="assistant-panel__selection">
          <span>Selected text</span>
          <em>{selectionMeta?.section || "resume"}</em>
          <strong>{selectedText}</strong>
        </div>
      ) : null}
      {statusMessage ? <div className="assistant-panel__error">{statusMessage}</div> : null}

      <div className="assistant-panel__readiness">
        <span className={hasSelection ? "assistant-panel__readiness-item assistant-panel__readiness-item--ok" : "assistant-panel__readiness-item"}>
          {hasSelection ? "Selection ready" : "Select text"}
        </span>
        <span className={hasJobTarget ? "assistant-panel__readiness-item assistant-panel__readiness-item--ok" : "assistant-panel__readiness-item"}>
          {hasJobTarget ? "Job target ready" : "Add job target"}
        </span>
        <span className={hasApiKey ? "assistant-panel__readiness-item assistant-panel__readiness-item--ok" : "assistant-panel__readiness-item"}>
          {hasApiKey ? "API key ready" : "Add API key"}
        </span>
      </div>

      <details className="assistant-panel__context-details" open={!hasJobTarget}>
        <summary>Context Settings</summary>
        <div className="assistant-panel__context-body">
          <label>
            <span>Target Role Preset</span>
            <select value={targetRole} onChange={(e) => onTargetRoleChange(e.target.value)}>
              <option value="">Custom JD (Below)</option>
              <option value="Google SDE 1">Google SDE 1</option>
              <option value="AI Engineer">AI Engineer</option>
              <option value="Full Stack Developer">Full Stack Developer</option>
              <option value="Data Scientist">Data Scientist</option>
              <option value="Product Manager">Product Manager</option>
            </select>
          </label>
          <label>
            <span>Experience Level</span>
            <select value={experienceLevel} onChange={(e) => onExperienceLevelChange(e.target.value)}>
              <option value="Beginner">Beginner (Entry-Level / Student)</option>
              <option value="Intermediate">Intermediate (1-4 Years)</option>
              <option value="Expert">Expert (5+ Years / Leadership)</option>
            </select>
          </label>
          <label>
            <span>Custom Job Description</span>
            <textarea
              rows={4}
              value={jobDescription}
              onChange={(event) => onJobDescriptionChange(event.target.value)}
              placeholder="Paste the target job description for ATS scoring and section-level tailoring."
            />
          </label>
          <small>{jobWordCount ? `${jobWordCount} words loaded` : "No explicit JD text added"}</small>
        </div>
      </details>

      <div className="assistant-panel__quick-actions">
        {quickPrompts.map((prompt) => (
          <button disabled={!canSubmitEdits} key={prompt} onClick={() => handleQuickPrompt(prompt)} type="button">
            {prompt}
          </button>
        ))}
      </div>

      <div className="assistant-panel__thread">
        {messages.slice(-5).map((message) => (
          <article className={`assistant-message assistant-message--${message.role}`} key={message.id}>
            {message.content}
          </article>
        ))}
      </div>

      <form className="assistant-panel__composer" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isLoading}
          placeholder={hasSelection ? "Describe the change you want..." : "Select text in the resume first..."}
        />
        <button disabled={!canSubmitEdits || !input.trim()} type="submit">
          ↗
        </button>
      </form>
    </aside>
  );
});

export default Chat;
