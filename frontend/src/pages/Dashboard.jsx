import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import ResumeCard from "../components/ResumeCard/ResumeCard";
import { downloadDocx, downloadPdf } from "../utils/api";
import {
  createResume,
  deleteResumes,
  getResumes,
  seedResumesIfEmpty,
  updateResume,
} from "../utils/resumeStorage";

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Dashboard({ onCreateResume }) {
  const navigate = useNavigate();
  const [resumes, setResumes] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [renameDraft, setRenameDraft] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [bulkAction, setBulkAction] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    seedResumesIfEmpty();
    setResumes(getResumes());
  }, []);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => resumes.some((resume) => resume.id === id)));
  }, [resumes]);

  useEffect(() => {
    if (!statusMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setStatusMessage(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  const filteredResumes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return resumes;
    }

    return resumes.filter((resume) =>
      [resume.title, resume.template].join(" ").toLowerCase().includes(query),
    );
  }, [resumes, search]);

  const handleOpen = (id) => navigate(`/playground/${id}`);

  const allVisibleSelected =
    filteredResumes.length > 0 && filteredResumes.every((resume) => selectedIds.includes(resume.id));

  const toggleSelect = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  };

  const toggleSelectVisible = () => {
    if (!filteredResumes.length) {
      return;
    }

    setSelectedIds((current) => {
      const visibleIds = filteredResumes.map((resume) => resume.id);
      if (visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id));
      }

      return Array.from(new Set([...current, ...visibleIds]));
    });
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setIsRenaming(false);
    setRenameDraft("");
  };

  const handleCreate = () => {
    const resume = createResume({
      title: `My Resume ${resumes.length + 1}`,
      template: "classic",
    });
    setResumes(getResumes());
    navigate(`/playground/${resume.id}`);
  };

  const selectedResumes = useMemo(
    () => resumes.filter((resume) => selectedIds.includes(resume.id)),
    [resumes, selectedIds],
  );

  const handleDeleteSelected = () => {
    const nextResumes = deleteResumes(selectedIds);
    setResumes(nextResumes);
    clearSelection();
    setStatusMessage("Selected resumes deleted");
  };

  const handleRenameStart = () => {
    if (selectedIds.length !== 1) {
      return;
    }

    setRenameDraft(selectedResumes[0]?.title || "");
    setIsRenaming(true);
  };

  const handleRenameSave = () => {
    if (selectedIds.length !== 1 || !renameDraft.trim()) {
      return;
    }

    updateResume(selectedIds[0], { title: renameDraft.trim() });
    setResumes(getResumes());
    setIsRenaming(false);
    setStatusMessage("Resume renamed");
  };

  const handleBulkDownload = async (format) => {
    if (!selectedResumes.length) {
      return;
    }

    setBulkAction(format);

    try {
      for (const resume of selectedResumes) {
        const result =
          format === "docx"
            ? await downloadDocx({ resume })
            : await downloadPdf({ resume });
        triggerBlobDownload(result.blob, result.filename);
      }

      setStatusMessage(`Downloaded ${selectedResumes.length} ${format.toUpperCase()} file${selectedResumes.length === 1 ? "" : "s"}`);
    } catch (error) {
      setStatusMessage(error.message || "Download failed");
    } finally {
      setBulkAction("");
    }
  };

  return (
    <section className="page-section">
      <div className="page-section__header">
        <div className="page-section__title-group">
          <h1>My Resumes</h1>
          <p>{resumes.length} resumes · AI-optimized</p>
          <div className="page-section__meta-row">
            <span className="page-meta-pill">Local-first drafts</span>
            <span className="page-meta-pill">{filteredResumes.length} visible</span>
          </div>
        </div>

        <label className="search-field">
          <span>⌕</span>
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search resumes..."
          />
        </label>
      </div>

      {filteredResumes.length ? (
        <div className="dashboard-selection-row">
          <button className="toolbar-button toolbar-button--muted" onClick={toggleSelectVisible} type="button">
            {allVisibleSelected ? "Deselect" : "Select"}
          </button>
          {selectedIds.length ? (
            <button className="toolbar-button toolbar-button--muted" onClick={clearSelection} type="button">
              Clear Selection
            </button>
          ) : null}
        </div>
      ) : null}

      {selectedIds.length ? (
        <div className="bulk-bar">
          <div className="bulk-bar__summary">
            <strong>{selectedIds.length} selected</strong>
            <span>{statusMessage || "Choose an action for the selected resumes"}</span>
          </div>

          {isRenaming ? (
            <div className="bulk-bar__rename">
              <input
                type="text"
                value={renameDraft}
                onChange={(event) => setRenameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleRenameSave();
                  }
                }}
                placeholder="Rename selected resume"
              />
              <button className="toolbar-button toolbar-button--primary" onClick={handleRenameSave} type="button">
                Save
              </button>
              <button className="toolbar-button toolbar-button--muted" onClick={() => setIsRenaming(false)} type="button">
                Cancel
              </button>
            </div>
          ) : (
            <div className="bulk-bar__actions">
              <button
                className="toolbar-button toolbar-button--muted"
                disabled={bulkAction === "pdf"}
                onClick={() => handleBulkDownload("pdf")}
                type="button"
              >
                {bulkAction === "pdf" ? "Downloading..." : "Download PDF"}
              </button>
              <button
                className="toolbar-button toolbar-button--muted"
                disabled={bulkAction === "docx"}
                onClick={() => handleBulkDownload("docx")}
                type="button"
              >
                {bulkAction === "docx" ? "Downloading..." : "Download DOCX"}
              </button>
              <button
                className="toolbar-button toolbar-button--muted"
                disabled={selectedIds.length !== 1}
                onClick={handleRenameStart}
                type="button"
              >
                Rename
              </button>
              <button className="toolbar-button bulk-bar__danger" onClick={handleDeleteSelected} type="button">
                Delete
              </button>
              <button className="toolbar-button toolbar-button--muted" onClick={clearSelection} type="button">
                Clear
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="resume-grid">
        {filteredResumes.map((resume) => (
          <ResumeCard
            key={resume.id}
            resume={resume}
            selected={selectedIds.includes(resume.id)}
            onOpen={handleOpen}
            onToggleSelect={toggleSelect}
          />
        ))}

        <button className="resume-card resume-card--ghost" onClick={onCreateResume || handleCreate} type="button">
          <span className="resume-card__plus">+</span>
          <span>Create New Resume</span>
        </button>
      </div>
    </section>
  );
}
