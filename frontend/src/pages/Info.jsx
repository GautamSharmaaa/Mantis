import React, { useEffect, useMemo, useRef, useState } from "react";

import { importProfileResume } from "../utils/api";
import { DEFAULT_PROFILE, getProfile, normalizeProfile, saveProfile, getStoredApiKey } from "../utils/workspaceStorage";

const IMPORT_ACCEPT = ".pdf,.docx,.txt,.md";
const AUTO_SAVE_DELAY = 500;

const PROFILE_FIELDS = [
  { key: "fullName", label: "Full Name", placeholder: DEFAULT_PROFILE.fullName },
  { key: "email", label: "Email", placeholder: DEFAULT_PROFILE.email },
  { key: "phone", label: "Phone", placeholder: DEFAULT_PROFILE.phone },
  { key: "location", label: "Location", placeholder: DEFAULT_PROFILE.location },
  { key: "jobTitle", label: "Job Title", placeholder: DEFAULT_PROFILE.jobTitle },
  { key: "website", label: "Website", placeholder: DEFAULT_PROFILE.website },
  { key: "linkedin", label: "LinkedIn", placeholder: DEFAULT_PROFILE.linkedin },
  { key: "github", label: "GitHub", placeholder: DEFAULT_PROFILE.github },
];

const TEXTAREA_FIELDS = [
  {
    key: "summary",
    label: "Professional Summary",
    rows: 4,
    placeholder: "Brief summary of your professional background...",
  },
  {
    key: "experience",
    label: "Experience Snapshot",
    rows: 6,
    placeholder: "Paste the core experience details you want available across resumes...",
  },
  {
    key: "skills",
    label: "Core Skills",
    rows: 3,
    placeholder: "React, Node.js, Python, FastAPI, TypeScript",
  },
];

function mergeImportedProfile(current, imported) {
  const next = { ...current };

  Object.entries(imported || {}).forEach(([field, value]) => {
    if (typeof value === "string" && value.trim()) {
      next[field] = value.trim();
    }
  });

  return normalizeProfile(next);
}

function countCompletedFields(profile) {
  return [...PROFILE_FIELDS, ...TEXTAREA_FIELDS].reduce((count, field) => {
    return profile[field.key]?.trim() ? count + 1 : count;
  }, 0);
}

export default function Info() {
  const [profile, setProfile] = useState(() => getProfile());
  const [saveState, setSaveState] = useState("saved");
  const [importState, setImportState] = useState("idle");
  const [importSummary, setImportSummary] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const hasMountedRef = useRef(false);

  const completedFields = useMemo(() => countCompletedFields(profile), [profile]);
  const detectedFieldCount = importSummary?.detected_fields?.length || 0;

  const dynamicTextAreas = useMemo(() => {
    const defaultKeys = TEXTAREA_FIELDS.map((f) => f.key);
    const extraKeys = Object.keys(profile).filter(
      (key) => !PROFILE_FIELDS.some((f) => f.key === key) && !defaultKeys.includes(key)
    );
    
    return [
      ...TEXTAREA_FIELDS,
      ...extraKeys.map((key) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1").trim(),
        rows: 4,
        placeholder: `Additional context for ${key}...`,
      })),
    ];
  }, [profile]);

  const handleAddNewSection = () => {
    const name = window.prompt("Enter new section name (e.g. Education):");
    if (name && name.trim()) {
      // camelCase it for key
      const words = name.trim().split(/\s+/);
      const key = words[0].toLowerCase() + words.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join("");
      if (profile[key] === undefined) {
        updateField(key, " ");
      }
    }
  };

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return undefined;
    }

    setSaveState("saving");
    const timeout = window.setTimeout(() => {
      saveProfile(profile);
      setSaveState("saved");
    }, AUTO_SAVE_DELAY);

    return () => window.clearTimeout(timeout);
  }, [profile]);

  const updateField = (field, value) => {
    setErrorMessage("");
    setProfile((current) =>
      normalizeProfile({
        ...current,
        [field]: value,
      }),
    );
  };

  const handleManualSave = () => {
    saveProfile(profile);
    setSaveState("saved");
  };

  const handleImportResult = async (file) => {
    if (!file) {
      return;
    }

    setErrorMessage("");
    setImportState("importing");

    try {
      const apiKey = getStoredApiKey();
      const result = await importProfileResume(file, apiKey);
      const mergedProfile = mergeImportedProfile(profile, result.profile);
      setProfile(mergedProfile);
      saveProfile(mergedProfile);
      setSaveState("saved");
      setImportSummary(result);
      setImportState("success");
    } catch (error) {
      setImportState("error");
      setErrorMessage(error.message || "We couldn't import that resume.");
    }
  };

  const handleFileInputChange = async (event) => {
    const file = event.target.files?.[0];
    await handleImportResult(file);
    event.target.value = "";
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    await handleImportResult(file);
  };

  const saveLabel =
    saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : "Save";

  const importLabel =
    importState === "importing"
      ? "Extracting..."
      : importState === "success"
        ? "Imported"
        : "Import from Resume";

  return (
    <section className="page-section">
      <div className="page-section__header info-page__header">
        <div className="page-section__title-group">
          <h1>My Info</h1>
          <p>Your personal details, links, and experience context used across resumes.</p>
          <div className="page-section__meta-row">
            <span className="page-meta-pill">{completedFields}/11 fields ready</span>
            <span className="page-meta-pill">
              {saveState === "saving" ? "Auto-saving locally" : "Stored locally"}
            </span>
          </div>
        </div>

        <div className="page-section__actions">
          <input
            accept={IMPORT_ACCEPT}
            className="info-import__input"
            onChange={handleFileInputChange}
            ref={fileInputRef}
            type="file"
          />
          <button
            className="toolbar-button toolbar-button--muted"
            disabled={importState === "importing"}
            onClick={openFilePicker}
            type="button"
          >
            {importLabel}
          </button>
          <button className="toolbar-button toolbar-button--primary" onClick={handleManualSave} type="button">
            {saveLabel}
          </button>
        </div>
      </div>

      <div className="info-overview">
        <section
          className={`info-import ${dragActive ? "info-import--drag" : ""}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (event.currentTarget === event.target) {
              setDragActive(false);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDrop={handleDrop}
        >
          <div className="info-import__copy">
            <span className="info-import__eyebrow">Quick Start</span>
            <h2>Import from your resume</h2>
            <p>Drop a PDF, DOCX, TXT, or Markdown resume and Mantis will extract the core profile details automatically.</p>
          </div>

          <div className="info-import__actions">
            <button
              className="toolbar-button toolbar-button--primary"
              disabled={importState === "importing"}
              onClick={openFilePicker}
              type="button"
            >
              {importState === "importing" ? "Extracting..." : "Choose File"}
            </button>
            <span>Supported: PDF, DOCX, TXT, MD</span>
          </div>
        </section>

        <section className="info-summary-card">
          <div>
            <span className="info-summary-card__label">Import status</span>
            <strong>
              {importState === "success"
                ? "Resume imported"
                : importState === "importing"
                  ? "Extraction in progress"
                  : "Waiting for a resume"}
            </strong>
            <p>
              {importSummary?.source_filename
                ? `${importSummary.source_filename} processed with ${detectedFieldCount} fields detected.`
                : "Imported details are applied immediately and saved locally."}
            </p>
          </div>
          {importSummary?.detected_fields?.length ? (
            <div className="info-summary-card__chips">
              {importSummary.detected_fields.map((field) => (
                <span className="page-meta-pill" key={field}>
                  {field}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      {errorMessage ? <div className="workspace-flash workspace-flash--error">{errorMessage}</div> : null}

      <div className="info-layout">
        <section className="info-panel">
          <div className="info-panel__header">
            <div>
              <h2>Profile Details</h2>
              <p>Keep identity and contact details clean so every resume starts from solid source data.</p>
            </div>
            <span className="info-panel__status">
              {saveState === "saving" ? "Saving..." : "Saved locally"}
            </span>
          </div>

          <div className="info-grid">
            {PROFILE_FIELDS.map((field) => (
              <label className="settings-field" key={field.key}>
                <span>{field.label}</span>
                <input
                  onChange={(event) => updateField(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  value={profile[field.key] || ""}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="info-panel">
          <div className="info-panel__header">
            <div>
              <h2>Career Context</h2>
              <p>These fields give Mantis richer material to work from when tailoring resumes later.</p>
            </div>
          </div>

          <div className="info-stack">
            {dynamicTextAreas.map((field) => (
              <label className="settings-field settings-field--wide" key={field.key}>
                <span>{field.label}</span>
                <textarea
                  onChange={(event) => updateField(field.key, event.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows}
                  value={profile[field.key] || ""}
                />
              </label>
            ))}
            <button className="toolbar-button toolbar-button--primary" onClick={handleAddNewSection} style={{ alignSelf: "flex-start", marginTop: "10px" }} type="button">
              + Add Custom Section
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
