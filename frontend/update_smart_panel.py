import re

with open('/Users/gautam/Documents/Mantis/frontend/src/styles.css', 'r') as f:
    content = f.read()

# 1. Update workspace-body width
content = content.replace(
'''.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 16px;
  overflow: hidden;
  background: #0e1311;
}

.workspace-body--full {
  grid-template-columns: minmax(0, 1fr);
}''',
'''.workspace-body {
  display: flex;
  min-height: 0;
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 16px;
  overflow: hidden;
  background: #0d1210;
}

.workspace-canvas {
  flex: 1;
  min-width: 0;
}''')

# 2. Extract out all .assistant-panel and .ats-dock
start_marker = ".assistant-panel {"
end_marker = "@keyframes previewPulse {"

start_index = content.find(start_marker)
end_index = content.find(end_marker)

new_css = """
/* ── Smart Panel ───────────────────────────────────────────────────────────── */
.smart-panel {
  width: 340px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--border);
}

.smart-panel__header {
  padding: 12px 16px 0;
  border-bottom: 1px solid var(--border);
  background: rgba(13, 18, 16, 0.95);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.smart-panel__header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.smart-panel__header-score {
  display: flex;
  align-items: center;
  gap: 8px;
}

.smart-panel__badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.02em;
}

.smart-panel__badge--perfect { background: rgba(9, 245, 154, 0.16); color: #09f59a; }
.smart-panel__badge--strong  { background: rgba(74, 222, 128, 0.16); color: #4ade80; }
.smart-panel__badge--solid   { background: rgba(96, 165, 250, 0.16); color: #60a5fa; }
.smart-panel__badge--weak    { background: rgba(251, 191, 36, 0.16); color: #fbbf24; }
.smart-panel__badge--poor    { background: rgba(248, 113, 113, 0.16); color: #f87171; }

.smart-panel__power-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 0;
  background: linear-gradient(180deg, rgba(9, 245, 154, 0.12) 0%, rgba(9, 245, 154, 0.04) 100%);
  color: var(--accent);
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.1), 0 0 0 1px rgba(9, 245, 154, 0.2);
}
.smart-panel__power-btn:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(9, 245, 154, 0.16) 0%, rgba(9, 245, 154, 0.08) 100%);
  transform: translateY(-1px);
}
.smart-panel__power-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  filter: grayscale(1);
}

.smart-panel__power-btn--loading .smart-panel__power-icon {
  display: inline-block;
  animation: powerPulse 1s infinite alternate;
}

@keyframes powerPulse {
  0% { transform: scale(1); opacity: 0.8; filter: drop-shadow(0 0 2px var(--accent)); }
  100% { transform: scale(1.15); opacity: 1; filter: drop-shadow(0 0 6px var(--accent)); }
}

.smart-panel__tabs {
  display: flex;
  gap: 16px;
}

.smart-panel__tab {
  position: relative;
  padding: 8px 4px;
  background: none;
  border: none;
  color: var(--muted);
  font-size: 0.88rem;
  font-weight: 500;
  cursor: pointer;
  transition: color 150ms;
}

.smart-panel__tab:hover {
  color: var(--soft);
}

.smart-panel__tab--active {
  color: var(--text);
  font-weight: 600;
}

.smart-panel__tab--active::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--accent);
  border-radius: 2px 2px 0 0;
}

.smart-panel__tab-alert {
  position: absolute;
  top: 6px;
  right: -6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f87171;
  box-shadow: 0 0 0 2px var(--panel);
}

.smart-panel__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.smart-panel__scrollable {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* ── ATS Content ───────────────────────────────────────────────────────────── */
.smart-panel__score-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 16px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.01);
}

.ats-meter {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
}

.smart-panel__score-labels {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.smart-panel__grade {
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--text);
}

.smart-panel__delta {
  font-size: 0.76rem;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255,255,255,0.06);
}

.smart-panel__delta--up { color: #09f59a; background: rgba(9, 245, 154, 0.12); }
.smart-panel__delta--down { color: #f87171; background: rgba(248, 113, 113, 0.12); }

.smart-panel__critical {
  font-size: 0.76rem;
  color: #f87171;
  font-weight: 600;
  background: rgba(248, 113, 113, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.smart-panel__recheck-btn {
  margin-top: 2px;
  padding: 4px 0;
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 0.76rem;
  cursor: pointer;
  transition: color 150ms;
}
.smart-panel__recheck-btn:hover { color: var(--text); }

.smart-panel__block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.smart-panel__label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}

.smart-panel__empty {
  font-size: 0.86rem;
  color: var(--muted);
  text-align: center;
  padding: 24px 0;
  font-style: italic;
}

/* Suggestions */
.smart-panel__suggestion-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.smart-suggestion {
  padding: 12px;
  border-left: 3px solid transparent;
  background: var(--panel-2);
  border-radius: 6px;
  animation: slideInR 350ms var(--ease) both;
}

@keyframes slideInR {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

.smart-suggestion--critical { border-left-color: #f87171; background: linear-gradient(90deg, rgba(248,113,113,0.06), transparent); }
.smart-suggestion--high { border-left-color: #fbbf24; background: linear-gradient(90deg, rgba(251,191,36,0.06), transparent); }
.smart-suggestion--medium { border-left-color: #60a5fa; }

.smart-suggestion__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.smart-suggestion__badge {
  font-size: 0.72rem;
  padding: 2px 6px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  color: var(--text);
  text-transform: capitalize;
}

.smart-suggestion__fix-btn {
  margin-left: auto;
  padding: 2px 8px;
  background: var(--accent);
  color: #032b1a;
  border: none;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
}
.smart-suggestion__fix-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(9, 245, 154, 0.2);
}

.smart-suggestion p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--soft);
}

.smart-panel__show-more {
  padding: 8px;
  background: var(--panel-2);
  border: 1px dotted var(--border);
  color: var(--muted);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
}
.smart-panel__show-more:hover { color: var(--text); border-color: var(--soft); }

/* Sections */
.smart-panel__sections {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ATS Section from ATSPanel */
.ats-section {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-2);
  overflow: hidden;
  animation: slideInR 400ms var(--ease) both;
}

.ats-section__header {
  display: grid;
  grid-template-columns: 80px 1fr 34px 16px;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  transition: background 150ms;
}
.ats-section__header:hover { background: rgba(255,255,255,0.02); }

.ats-section__name { font-size: 0.82rem; font-weight: 600; text-align: left; }
.ats-section__bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
.ats-section__fill { display: block; height: 100%; border-radius: 999px; transition: width 1s var(--ease); }
.ats-section__fill--strong { background: #4ade80; }
.ats-section__fill--weak { background: #fbbf24; }
.ats-section__fill--poor { background: #f87171; }
.ats-section__pct { font-size: 0.8rem; text-align: right; }
.ats-section__pct--strong { color: #4ade80; }
.ats-section__pct--weak { color: #fbbf24; }
.ats-section__pct--poor { color: #f87171; }

.ats-section__chevron { color: var(--muted); font-size: 0.8rem; }

.ats-section__checks {
  padding: 10px 12px;
  background: rgba(0,0,0,0.15);
  border-top: 1px solid rgba(255,255,255,0.03);
  display: grid;
  gap: 8px;
}

.ats-check { display: flex; align-items: flex-start; gap: 8px; font-size: 0.8rem; line-height: 1.4; }
.ats-check__icon { font-weight: 700; margin-top: 1px; }
.ats-check--pass .ats-check__icon { color: #09f59a; }
.ats-check--fail .ats-check__icon { color: #f87171; }
.ats-check strong { display: block; color: var(--text); }
.ats-check p { margin: 2px 0 0; color: var(--muted); font-size: 0.76rem; }


/* Keywords */
.smart-panel__kw-group {
  margin-bottom: 12px;
}

.smart-panel__kw-tag {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  margin-bottom: 6px;
}
.smart-panel__kw-tag--missing { color: #f87171; }
.smart-panel__kw-tag--matched { color: #09f59a; }
.smart-panel__kw-tag--weak { color: #fbbf24; }

.smart-panel__kw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.smart-chip {
  font-family: var(--font-mono, monospace);
  font-size: 0.74rem;
  font-style: normal;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-2);
}

.smart-chip--matched { color: #09f59a; border-color: rgba(9, 245, 154, 0.2); background: rgba(9, 245, 154, 0.05); }
.smart-chip--missing { color: #f87171; border-color: rgba(248, 113, 113, 0.2); background: rgba(248, 113, 113, 0.05); }
.smart-chip--weak { color: #fbbf24; border-color: rgba(251, 191, 36, 0.2); background: rgba(251, 191, 36, 0.05); }


/* ── AI Content ────────────────────────────────────────────────────────────── */
.smart-panel__content--ai .smart-panel__scrollable {
  padding: 16px;
  gap: 20px;
}

.smart-panel__context-details {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--panel-2);
  overflow: hidden;
}

.smart-panel__context-details summary {
  padding: 10px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  background: rgba(255, 255, 255, 0.02);
}

.smart-panel__context-details summary:hover {
  background: rgba(255, 255, 255, 0.04);
}

.smart-panel__context-body {
  padding: 14px;
  display: grid;
  gap: 12px;
  border-top: 1px solid var(--border);
}

.smart-panel__context-body label span {
  display: block;
  font-size: 0.76rem;
  color: var(--muted);
  margin-bottom: 4px;
}

.smart-panel__context-body select,
.smart-panel__context-body textarea {
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--panel-3);
  color: var(--text);
  font-size: 0.85rem;
}

.smart-panel__context-body textarea { resize: vertical; min-height: 80px; }
.smart-panel__context-body small { color: var(--muted); font-size: 0.72rem; }

.smart-panel__quick-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.smart-action-btn {
  width: 100%;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--text);
  font-weight: 600;
  font-size: 0.86rem;
  cursor: pointer;
}
.smart-action-btn:hover:not(:disabled) {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.1);
}
.smart-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.smart-action-btn--loading {
  color: var(--accent);
  border-color: rgba(9, 245, 154, 0.3);
}

.smart-panel__selection {
  padding: 12px;
  border-radius: 8px;
  background: rgba(9, 245, 154, 0.05);
  border: 1px solid rgba(9, 245, 154, 0.15);
}

.smart-panel__selection-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;
  font-size: 0.76rem;
}

.smart-panel__selection-header span { color: var(--muted); }
.smart-panel__selection-header em { color: var(--accent); font-style: normal; font-weight: 600; text-transform: uppercase; }

.smart-panel__selection strong {
  display: block;
  font-size: 0.86rem;
  font-weight: 400;
  color: var(--text);
}

.smart-panel__error {
  padding: 10px;
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.1);
  color: #fca5a5;
  font-size: 0.82rem;
  border: 1px solid rgba(248, 113, 113, 0.2);
}

.smart-panel__prompt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.smart-panel__prompt-chips button {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--panel-2);
  color: var(--soft);
  font-size: 0.78rem;
  cursor: pointer;
}
.smart-panel__prompt-chips button:hover:not(:disabled) {
  border-color: rgba(9, 245, 154, 0.3);
  color: var(--text);
}

.smart-panel__chat-thread {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.smart-chat-msg {
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 0.9rem;
  line-height: 1.5;
  animation: slideInR 300ms var(--ease);
}

.smart-chat-msg--user {
  background: var(--panel-3);
  color: var(--text);
  border: 1px solid var(--border);
  border-bottom-right-radius: 4px;
  align-self: flex-end;
  max-width: 90%;
}

.smart-chat-msg--assistant {
  background: rgba(9, 245, 154, 0.05);
  color: var(--text);
  border: 1px solid rgba(9, 245, 154, 0.15);
  border-bottom-left-radius: 4px;
  align-self: flex-start;
  max-width: 95%;
}

.smart-panel__composer {
  display: flex;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border);
  background: var(--panel-2);
}

.smart-panel__composer input {
  flex: 1;
  background: var(--panel-3);
  padding: 12px 14px;
  border-radius: 20px;
  font-size: 0.9rem;
}

.smart-panel__composer button {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent);
  color: #032b1a;
  border: none;
  font-size: 1.2rem;
  font-weight: 700;
  cursor: pointer;
}
.smart-panel__composer button:disabled { opacity: 0.5; filter: grayscale(1); }
.smart-panel__composer button:hover:not(:disabled) { transform: scale(1.05); box-shadow: 0 4px 12px rgba(9,245,154,0.3); }

"""

content = content[:start_index] + new_css + content[end_index:]

with open('/Users/gautam/Documents/Mantis/frontend/src/styles.css', 'w') as f:
    f.write(content)

