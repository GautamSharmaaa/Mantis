import React, { memo, useState, useEffect } from "react";

// ─── Score tone helper ──────────────────────────────────────────────────────
function scoreTone(score) {
  if (score >= 90) return "perfect";
  if (score >= 75) return "strong";
  if (score >= 60) return "solid";
  if (score >= 40) return "weak";
  return "poor";
}

const TONE_COLOR = {
  perfect: "#09f59a",
  strong:  "#4ade80",
  solid:   "#60a5fa",
  weak:    "#fbbf24",
  poor:    "#f87171",
};

const TONE_LABEL = {
  perfect: "ATS Ready",
  strong:  "Good",
  solid:   "Average",
  weak:    "Needs Work",
  poor:    "Critical",
};

const PRIORITY_ICON = {
  critical: "🔴",
  high:     "🟠",
  medium:   "🟡",
  low:      "⚪",
};

// ─── Circular SVG Meter ─────────────────────────────────────────────────────
function CircularMeter({ score, isLoading, tone }) {
  const R = 37;
  const C = 2 * Math.PI * R;
  const pct = isLoading ? 0 : Math.min(Math.max(score, 0), 100);
  const offset = C * (1 - pct / 100);
  const color = TONE_COLOR[tone] || "#09f59a";

  return (
    <svg viewBox="0 0 100 100" className="ats-meter" aria-label={`ATS Score ${score} out of 100`}>
      <defs>
        <radialGradient id={`ats-glow-${tone}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        <filter id="ats-blur">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <circle cx="50" cy="50" r="44" fill={`url(#ats-glow-${tone})`} />

      <circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke="rgba(255,255,255,0.07)"
        strokeWidth="6"
      />

      <circle
        cx="50" cy="50" r={R}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
        className="ats-meter__arc"
        filter="url(#ats-blur)"
      />

      <text
        x="50" y="46"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize="22"
        fontWeight="800"
        fontFamily="inherit"
      >
        {isLoading ? "…" : score}
      </text>
      <text
        x="50" y="63"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.3)"
        fontSize="9"
        fontFamily="inherit"
      >
        / 100
      </text>
    </svg>
  );
}

// ─── Section Breakdown Row ────────────────────────────────────────────────────
function SectionRow({ sec, isOpen, onToggle, animIndex }) {
  const pct = sec.percentageScore ?? 0;
  const tone = pct >= 75 ? "strong" : pct >= 50 ? "weak" : "poor";
  const hasChecks = sec.checks && sec.checks.length > 0;

  return (
    <div
      className={`ats-section ${isOpen ? "ats-section--open" : ""}`}
      style={{ animationDelay: `${animIndex * 35}ms` }}
    >
      <button
        className="ats-section__header"
        onClick={() => hasChecks && onToggle(sec.sectionId)}
        type="button"
        aria-expanded={isOpen}
      >
        <span className="ats-section__name">{sec.name}</span>
        <div className="ats-section__bar">
          <i
            className={`ats-section__fill ats-section__fill--${tone}`}
            style={{ width: `${Math.max(3, pct)}%` }}
          />
        </div>
        <strong className={`ats-section__pct ats-section__pct--${tone}`}>
          {pct}%
        </strong>
        {hasChecks && (
          <span className="ats-section__chevron" aria-hidden="true">
            {isOpen ? "▾" : "▸"}
          </span>
        )}
      </button>

      {isOpen && hasChecks && (
        <div className="ats-section__checks">
          {sec.checks.map((c) => (
            <div
              key={c.id}
              className={`ats-check ${c.passed ? "ats-check--pass" : "ats-check--fail"}`}
            >
              <span className="ats-check__icon">{c.passed ? "✓" : "✗"}</span>
              <div>
                <strong>{c.label}</strong>
                {c.message && <p>{c.message}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main SmartPanel ────────────────────────────────────────────────────────────
const SmartPanel = memo(function SmartPanel({
  scoreData,
  isScoreLoading,
  scoreDelta,
  jobDescription,
  onManualCheck,
  onPowerGenerate,
  isPowerLoading,

  messages,
  selectionMeta,
  selectedText,
  onJobDescriptionChange,
  experienceLevel,
  onExperienceLevelChange,
  targetRole,
  onTargetRoleChange,
  onSend,
  onOptimizeAll,
  isChatLoading,
  isOptimizing,
  hasApiKey,
  statusMessage,
  onSyncInfo,
  syncLoading
}) {
  const [activeTab, setActiveTab] = useState("ats");
  const [expandedSection, setExpandedSection] = useState(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [chatInput, setChatInput] = useState("");

  const score           = scoreData.score || 0;
  const grade           = scoreData.grade || {};
  const sectionResults  = scoreData.section_results || [];
  const suggestions     = scoreData.suggestions || [];
  const weakWords       = (scoreData.audit?.weak_words_used || []).slice(0, 6);
  const missingKeywords = (scoreData.missing_keywords || []).slice(0, 10);
  const matchedKeywords = (scoreData.matched_keywords || []).slice(0, 8);
  const criticalIssues  = scoreData.critical_issues || 0;
  const highIssues      = scoreData.high_priority_issues || 0;
  const hasScore        = score > 0;
  
  const hasJobTarget    = Boolean(jobDescription?.trim()) || Boolean(targetRole);
  const hasSelection    = Boolean(selectedText?.trim());
  const canSubmitEdits  = hasSelection && hasJobTarget && hasApiKey && !isChatLoading;
  const canOptimize     = hasApiKey && !isOptimizing && !isChatLoading;
  const jobWordCount    = jobDescription?.trim() ? jobDescription.trim().split(/\s+/).length : 0;

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

  const tone       = scoreTone(score);
  const toneLabel  = TONE_LABEL[tone];

  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 4);
  const toggleSection = (id) => setExpandedSection((p) => (p === id ? null : id));

  const handleFixNow = (suggestionText) => {
    setActiveTab("ai");
    setChatInput(`Please fix this ATS issue: ${suggestionText}`);
  };

  const handleChatSubmit = async (event) => {
    event.preventDefault();
    const submitted = chatInput.trim();
    if (!submitted) return;

    const wasSent = await onSend(submitted);
    if (wasSent) {
      setChatInput("");
    }
  };

  const handleQuickPrompt = async (prompt) => {
    if (!canSubmitEdits) return;
    const wasSent = await onSend(prompt);
    if (wasSent) {
      setChatInput("");
    }
  };

  return (
    <aside className="smart-panel" aria-label="Smart Panel">
      
      {/* ── Panel Header ───────────────────────────────── */}
      <div className="smart-panel__header">
        <div className="smart-panel__header-top">
          <div className="smart-panel__header-score">
            <span className={`smart-panel__badge smart-panel__badge--${tone}`}>
              ATS {score}
            </span>
            {isScoreLoading && <span className="smart-panel__status-pulse"></span>}
          </div>
          
          <button
            className={`smart-panel__power-btn ${isPowerLoading ? "smart-panel__power-btn--loading" : ""}`}
            onClick={onPowerGenerate}
            disabled={isPowerLoading || isScoreLoading}
            type="button"
          >
            <span className="smart-panel__power-icon">⚡</span>
            <span>{isPowerLoading ? "Generating…" : "Power Generate"}</span>
          </button>
        </div>

        <div className="smart-panel__tabs">
          <button 
            className={`smart-panel__tab ${activeTab === "ats" ? "smart-panel__tab--active" : ""}`}
            onClick={() => setActiveTab("ats")}
          >
            ATS Analysis
            {criticalIssues > 0 && <span className="smart-panel__tab-alert" />}
          </button>
          <button 
            className={`smart-panel__tab ${activeTab === "ai" ? "smart-panel__tab--active" : ""}`}
            onClick={() => setActiveTab("ai")}
          >
            AI Assistant
          </button>
        </div>
      </div>

      {/* ── ATS Tab Content ────────────────────────────── */}
      {activeTab === "ats" && (
        <div className="smart-panel__content smart-panel__content--ats">
          
          <div className="smart-panel__score-row">
            <CircularMeter score={score} isLoading={isScoreLoading} tone={tone} />
            <div className="smart-panel__score-labels">
              {hasScore ? (
                <span className={`smart-panel__grade smart-panel__grade--${tone}`}>
                  {grade.grade || "–"} · {toneLabel}
                </span>
              ) : (
                <span className="smart-panel__grade smart-panel__grade--empty">
                  No score yet
                </span>
              )}
              {scoreDelta != null && scoreDelta !== 0 && (
                <span className={`smart-panel__delta ${scoreDelta > 0 ? "smart-panel__delta--up" : "smart-panel__delta--down"}`}>
                  {scoreDelta > 0 ? `↗ +${scoreDelta}` : `↘ ${scoreDelta}`} pts
                </span>
              )}
              {criticalIssues > 0 && (
                <span className="smart-panel__critical">
                  {criticalIssues} critical
                </span>
              )}
              <button
                className={`smart-panel__recheck-btn ${isScoreLoading ? "smart-panel__recheck-btn--loading" : ""}`}
                onClick={onManualCheck}
                disabled={isScoreLoading}
                type="button"
              >
                {isScoreLoading ? "Checking…" : "↻ Recheck"}
              </button>
            </div>
          </div>

          <div className="smart-panel__scrollable">
            {/* Fix Now / Suggestions */}
            {suggestions.length > 0 && (
              <div className="smart-panel__block">
                <p className="smart-panel__label">Fix Now</p>
                <div className="smart-panel__suggestion-list">
                  {visibleSuggestions.map((s, i) => (
                    <div
                      key={i}
                      className={`smart-suggestion smart-suggestion--${s.priority || "medium"}`}
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="smart-suggestion__header">
                        <span className="smart-suggestion__priority" aria-label={s.priority}>
                          {PRIORITY_ICON[s.priority] || "🟡"}
                        </span>
                        <span className="smart-suggestion__badge">{s.section}</span>
                        {(s.priority === "critical" || s.priority === "high") && (
                           <button 
                             className="smart-suggestion__fix-btn"
                             onClick={() => handleFixNow(s.text)}
                           >
                             Fix with AI ↗
                           </button>
                        )}
                      </div>
                      <p>{s.text}</p>
                    </div>
                  ))}
                </div>
                {suggestions.length > 4 && (
                  <button
                    className="smart-panel__show-more"
                    onClick={() => setShowAllSuggestions((v) => !v)}
                    type="button"
                  >
                    {showAllSuggestions ? "↑ Show less" : `+ ${suggestions.length - 4} more suggestions`}
                  </button>
                )}
              </div>
            )}

            {/* Section Breakdown */}
            <div className="smart-panel__block">
              <p className="smart-panel__label">Section Scores</p>
              <div className="smart-panel__sections">
                {sectionResults.length === 0 && (
                  <span className="smart-panel__empty">
                    {hasJobTarget ? "Run a check to see section scores" : "Add a job description to enable scoring"}
                  </span>
                )}
                {sectionResults.map((sec, i) => (
                  <SectionRow
                    key={sec.sectionId}
                    sec={sec}
                    isOpen={expandedSection === sec.sectionId}
                    onToggle={toggleSection}
                    animIndex={i}
                  />
                ))}
              </div>
            </div>

            {/* Keywords */}
            {(matchedKeywords.length > 0 || missingKeywords.length > 0 || weakWords.length > 0) && (
              <div className="smart-panel__block">
                <p className="smart-panel__label">Keywords & Optimization</p>
                
                {missingKeywords.length > 0 && (
                  <div className="smart-panel__kw-group">
                    <span className="smart-panel__kw-tag smart-panel__kw-tag--missing">⚠ Missing</span>
                    <div className="smart-panel__kw-chips">
                      {missingKeywords.map((k) => <em key={k} className="smart-chip smart-chip--missing">{k}</em>)}
                    </div>
                  </div>
                )}
                
                {weakWords.length > 0 && (
                  <div className="smart-panel__kw-group">
                    <span className="smart-panel__kw-tag smart-panel__kw-tag--weak">⊘ Weak</span>
                    <div className="smart-panel__kw-chips">
                      {weakWords.map((w) => <em key={w} className="smart-chip smart-chip--weak">{w}</em>)}
                    </div>
                  </div>
                )}

                {matchedKeywords.length > 0 && (
                  <div className="smart-panel__kw-group">
                    <span className="smart-panel__kw-tag smart-panel__kw-tag--matched">✓ Matched</span>
                    <div className="smart-panel__kw-chips">
                      {matchedKeywords.map((k) => <em key={k} className="smart-chip smart-chip--matched">{k}</em>)}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {!hasJobTarget && sectionResults.length === 0 && (
               <span className="smart-panel__empty">
                 Add a job description in the AI Assistant tab to see keyword analysis
               </span>
            )}
          </div>
        </div>
      )}

      {/* ── AI Tab Content ─────────────────────────────── */}
      {activeTab === "ai" && (
        <div className="smart-panel__content smart-panel__content--ai">
          
          <div className="smart-panel__scrollable">
            <details className="smart-panel__context-details" open={!hasJobTarget}>
              <summary>Job Context Settings</summary>
              <div className="smart-panel__context-body">
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

            <div className="smart-panel__quick-actions">
              <button 
                className={`smart-action-btn ${isOptimizing ? "smart-action-btn--loading" : ""}`}
                onClick={onOptimizeAll}
                disabled={!canOptimize}
                type="button"
              >
                ✦ Optimize Entire Resume
              </button>
              
              <button 
                className={`smart-action-btn ${syncLoading ? "smart-action-btn--loading" : ""}`}
                onClick={onSyncInfo}
                disabled={syncLoading}
                type="button"
              >
                Sync My Info
              </button>
            </div>

            {selectedText && (
              <div className="smart-panel__selection">
                <div className="smart-panel__selection-header">
                  <span>Selected text</span>
                  <em>{selectionMeta?.section || "resume"}</em>
                </div>
                <strong>{selectedText}</strong>
              </div>
            )}

            {statusMessage && <div className="smart-panel__error">{statusMessage}</div>}

            <div className="smart-panel__prompt-chips">
              {quickPrompts.map((prompt) => (
                <button 
                  disabled={!canSubmitEdits} 
                  key={prompt} 
                  onClick={() => handleQuickPrompt(prompt)} 
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="smart-panel__chat-thread">
              {messages.map((message) => (
                <article className={`smart-chat-msg smart-chat-msg--${message.role}`} key={message.id}>
                  {message.content}
                </article>
              ))}
            </div>
          </div>

          <form className="smart-panel__composer" onSubmit={handleChatSubmit}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isChatLoading}
              placeholder={hasSelection ? "Describe changes to selection..." : "Select text in the resume first..."}
            />
            <button disabled={!canSubmitEdits || !chatInput.trim()} type="submit" aria-label="Send">
              ↗
            </button>
          </form>

        </div>
      )}
    </aside>
  );
});

export default SmartPanel;
