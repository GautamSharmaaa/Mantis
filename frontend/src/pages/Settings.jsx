import React, { useState } from "react";

import { getStoredApiKey, saveStoredApiKey } from "../utils/workspaceStorage";

export default function Settings() {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveStoredApiKey(apiKey);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return (
    <section className="page-section page-section--narrow">
      <div className="page-section__header page-section__header--stack">
        <div>
          <h1>API Key Settings</h1>
          <p>Connect your OpenAI or Google Gemini API key to power AI features.</p>
        </div>
      </div>

      <div className="api-card">
        <label className="settings-field">
          <span>OpenAI or Gemini API Key</span>
          <div className="api-card__input-row">
            <input
              type="password"
              value={apiKey}
              onChange={(event) => {
                setSaved(false);
                setApiKey(event.target.value);
              }}
              placeholder="sk-... or AIza..."
            />
            <button className="api-card__peek" type="button" aria-label="Key visibility">
              ◌
            </button>
          </div>
        </label>

        <button className="toolbar-button toolbar-button--primary api-card__save" onClick={handleSave} type="button">
          {saved ? "Saved" : "Save Key"}
        </button>

        <p>Your API key is stored locally and never sent to our servers.</p>
      </div>
    </section>
  );
}
