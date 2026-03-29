import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

import ResumeCard from "../components/ResumeCard/ResumeCard";
import { downloadDocx, downloadPdf, importProfileResume, generateResume, getScore } from "../utils/api";
import {
  createResume,
  deleteResumes,
  getResumes,
  seedResumesIfEmpty,
  updateResume,
} from "../utils/resumeStorage";
import { getProfile, saveProfile, getStoredApiKey } from "../utils/workspaceStorage";

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

  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [mismatchPrompt, setMismatchPrompt] = useState(null);
  
  const [atsBreakdown, setAtsBreakdown] = useState(null);
  const [fetchingAts, setFetchingAts] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    seedResumesIfEmpty();
    setResumes(getResumes());
  }, []);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => resumes.some((resume) => resume.id === id)));
  }, [resumes]);

  useEffect(() => {
    if (!statusMessage) return undefined;
    const timeout = window.setTimeout(() => setStatusMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [statusMessage]);

  useEffect(() => {
    if (selectedIds.length === 1) {
      const target = resumes.find((r) => r.id === selectedIds[0]);
      if (target) {
        setFetchingAts(true);
        getScore({ resume: target, jobDescription: "" })
          .then((data) => setAtsBreakdown(data))
          .catch(() => setAtsBreakdown(null))
          .finally(() => setFetchingAts(false));
      }
    } else {
      setAtsBreakdown(null);
    }
  }, [selectedIds, resumes]);

  const filteredResumes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return resumes;
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
    if (!filteredResumes.length) return;
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
    if (selectedIds.length !== 1) return;
    setRenameDraft(selectedResumes[0]?.title || "");
    setIsRenaming(true);
  };

  const handleRenameSave = () => {
    if (selectedIds.length !== 1 || !renameDraft.trim()) return;
    updateResume(selectedIds[0], { title: renameDraft.trim() });
    setResumes(getResumes());
    setIsRenaming(false);
    setStatusMessage("Resume renamed");
  };

  const handleBulkDownload = async (format) => {
    if (!selectedResumes.length) return;
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

  const processUploadQueue = async (files) => {
    if (files.length === 0) {
      setUploadStatus("");
      return;
    }
    
    const currentFile = files[0];
    const remainingFiles = files.slice(1);
    
    setUploadStatus(`Extracting info from ${currentFile.name}...`);
    
    try {
      const apiKey = getStoredApiKey();
      const result = await importProfileResume(currentFile, apiKey);
      
      const existingProfile = getProfile();
      const extractedName = result.profile?.fullName || "";
      const existingName = existingProfile.fullName || "";
      
      const namesMatch = !existingName || !extractedName || 
            existingName.toLowerCase().trim() === extractedName.toLowerCase().trim();
            
      if (!namesMatch) {
        setMismatchPrompt({
           file: currentFile,
           parsedResult: result,
           extractedFullName: extractedName,
           remainingFiles
        });
        return;
      } else {
        await finishFileProcessing(currentFile, result, true, apiKey);
        processUploadQueue(remainingFiles);
      }
    } catch (err) {
      setStatusMessage(`Failed to parse ${currentFile.name}: ${err.message}`);
      processUploadQueue(remainingFiles);
    }
  };

  const finishFileProcessing = async (file, parsedResult, shouldUpdateProfile, apiKey) => {
    try {
      if (shouldUpdateProfile) {
        const currentProfile = getProfile();
        const merged = { ...currentProfile };
        Object.entries(parsedResult.profile || {}).forEach(([field, value]) => {
          if (typeof value === "string" && value.trim() && !merged[field]?.trim()) {
            merged[field] = value.trim();
          }
        });
        saveProfile(merged);
      }
      
      setUploadStatus(`Generating draft for ${file.name}...`);
      const generated = await generateResume({
         resumeText: parsedResult.full_text || "",
         jobDescription: "",
         apiKey: apiKey || "",
         title: file.name.replace(/\.[^/.]+$/, ""),
         template: "classic"
      });
      
      createResume({
          title: generated.title || file.name.replace(/\.[^/.]+$/, ""),
          template: generated.template || "classic",
          ats_score: generated.ats_score || 0,
          data: generated.data
      });
      setResumes(getResumes());

      if (parsedResult.used_llm === false && apiKey) {
         setStatusMessage("API failing: Regex was used as a fallback to extract profile.");
      }
    } catch (err) {
      setStatusMessage(`Failed to generate draft: ${err.message}`);
    }
  };

  const handleConfirmMismatch = async (updateProfile) => {
    const { file, parsedResult, remainingFiles } = mismatchPrompt;
    setMismatchPrompt(null);
    if (!updateProfile) {
        setStatusMessage(`Skipped importing profile for ${file.name} to protect your My Info details.`);
        processUploadQueue(remainingFiles);
        return;
    }
    await finishFileProcessing(file, parsedResult, true, getStoredApiKey());
    processUploadQueue(remainingFiles);
  };

  const handleDrag = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };
  
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
       processUploadQueue(Array.from(e.dataTransfer.files));
    }
  };
  
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
       processUploadQueue(Array.from(e.target.files));
    }
    e.target.value = "";
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

      {statusMessage && <div className="workspace-flash workspace-flash--error">{statusMessage}</div>}

      {/* Unified ATS Breakdown + Upload Panel */}
      <div className="dashboard-unified-top">
        <div 
           className={`info-import ${dragActive ? "info-import--drag" : ""}`}
           onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
           style={{ flex: "1" }}
        >
          <div className="info-import__copy">
            <span className="info-import__eyebrow">Start Here</span>
            <h2>Import Multiple Resumes</h2>
            <p>Drop PDFs/DOCXs here. We'll automatically build drafts, sync with My Info Profile, and run our ATS Engine.</p>
          </div>
          <div className="info-import__actions">
            <input type="file" multiple ref={fileInputRef} onChange={handleFileChange} style={{display: "none"}} accept=".pdf,.docx,.txt,.md" />
            <button className="toolbar-button toolbar-button--primary" onClick={() => fileInputRef.current?.click()} disabled={!!uploadStatus} type="button">
              {uploadStatus || "Choose Files"}
            </button>
          </div>
          
          {mismatchPrompt && (
              <div className="workspace-dialog" style={{ position: "absolute", top: 10, right: 10, background: "#fff", zIndex: 10, padding: 20, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", borderRadius: 8 }}>
                <h3 style={{marginTop: 0}}>Wait — Profile Mismatch</h3>
                <p style={{color: "#333", maxWidth: "300px", lineHeight: 1.4}}>
                   The document <strong>{mismatchPrompt.file.name}</strong> appears to belong to <strong>{mismatchPrompt.extractedFullName}</strong>.
                   Update "My Info" with these details?
                </p>
                <div style={{display: "flex", gap: "10px", marginTop: "15px"}}>
                   <button className="toolbar-button toolbar-button--primary" onClick={() => handleConfirmMismatch(true)}>Yes, Update</button>
                   <button className="toolbar-button toolbar-button--muted" onClick={() => handleConfirmMismatch(false)}>No, Skip Document</button>
                </div>
              </div>
          )}
        </div>

        {selectedIds.length === 1 && (
           <div className="info-panel" style={{ flex: "1", background: "var(--bg-layer)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "1.5rem" }}>
             <h3 style={{margin: "0 0 1rem", fontSize: "16px"}}>ATS Breakdown</h3>
             {fetchingAts ? (
                <div style={{ fontSize: "14px", color: "var(--fg-muted)" }}>Analyzing resume structure...</div>
             ) : atsBreakdown ? (
                <div>
                   <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem"}}>
                      <span style={{ fontSize: "14px", fontWeight: "600" }}>Score</span>
                      <strong className={`resume-card__score ${atsBreakdown.score >= 80 ? "resume-card__score--good" : atsBreakdown.score >= 65 ? "resume-card__score--warn" : "resume-card__score--bad"}`} style={{fontSize: "24px"}}>
                        {atsBreakdown.score}/100
                      </strong>
                   </div>
                   <div style={{fontSize: "13px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px"}}>
                      <div><strong>Grade:</strong> {atsBreakdown.grade.grade}</div>
                      <div><strong>Bullets:</strong> {atsBreakdown.breakdown.bullet_strength}/100</div>
                      <div><strong>Summary:</strong> {atsBreakdown.breakdown.summary_score}/100</div>
                      <div><strong>Formatting:</strong> {atsBreakdown.breakdown.formatting_score}/100</div>
                      <div><strong>Readability:</strong> {atsBreakdown.breakdown.readability}/100</div>
                      {atsBreakdown.breakdown.red_flag_penalty > 0 && <div style={{gridColumn: "span 2", color: "var(--error)"}}><strong>Penalty:</strong> -{atsBreakdown.breakdown.red_flag_penalty} pts</div>}
                   </div>
                </div>
             ) : (
                <div style={{ fontSize: "14px", color: "var(--fg-muted)" }}>Unable to load ATS score.</div>
             )}
           </div>
        )}
      </div>

      <div className="dashboard-selection-row" style={{ marginTop: "1.5rem" }}>
        {filteredResumes.length ? (
          <button className="toolbar-button toolbar-button--muted" onClick={toggleSelectVisible} type="button">
            {allVisibleSelected ? "Deselect" : "Select"}
          </button>
        ) : null}
        {selectedIds.length ? (
          <button className="toolbar-button toolbar-button--muted" onClick={clearSelection} type="button">
            Clear Selection
          </button>
        ) : null}
      </div>

      {selectedIds.length ? (
        <div className="bulk-bar">
          <div className="bulk-bar__summary">
            <strong>{selectedIds.length} selected</strong>
            <span>Choose an action for the selected resumes</span>
          </div>
          {isRenaming ? (
            <div className="bulk-bar__rename">
              <input type="text" value={renameDraft} onChange={(e) => setRenameDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleRenameSave() }} placeholder="Rename selected resume" />
              <button className="toolbar-button toolbar-button--primary" onClick={handleRenameSave} type="button">Save</button>
              <button className="toolbar-button toolbar-button--muted" onClick={() => setIsRenaming(false)} type="button">Cancel</button>
            </div>
          ) : (
            <div className="bulk-bar__actions">
              <button className="toolbar-button toolbar-button--muted" disabled={bulkAction === "pdf"} onClick={() => handleBulkDownload("pdf")} type="button">{bulkAction === "pdf" ? "Downloading..." : "Download PDF"}</button>
              <button className="toolbar-button toolbar-button--muted" disabled={bulkAction === "docx"} onClick={() => handleBulkDownload("docx")} type="button">{bulkAction === "docx" ? "Downloading..." : "Download DOCX"}</button>
              <button className="toolbar-button toolbar-button--muted" disabled={selectedIds.length !== 1} onClick={handleRenameStart} type="button">Rename</button>
              <button className="toolbar-button bulk-bar__danger" onClick={handleDeleteSelected} type="button">Delete</button>
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
          <span>Create Blank Draft</span>
        </button>
      </div>
    </section>
  );
}
