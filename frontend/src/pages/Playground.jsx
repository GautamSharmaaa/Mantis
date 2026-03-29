import React from "react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import ATSPanel from "../components/ATSPanel/ATSPanel";
import Canvas from "../components/Canvas/Canvas";
import Chat from "../components/Chat/Chat";
import TemplateSelector from "../components/TemplateSelector/TemplateSelector";
import { chatEdit, downloadDocx, downloadPdf, getScore, updateBullet, syncProfile, optimizeResume, powerGenerate, getAiSuggestions } from "../utils/api";
import { safeGetItem, safeRandomUUID, safeSetItem } from "../utils/browser";
import { getResumes, saveResumes } from "../utils/resumeStorage";
import { getProfile, getStoredApiKey } from "../utils/workspaceStorage";

const JD_STORAGE_PREFIX = "mantis-playground-jd:";
const EMPTY_SCORE = {
  score: 0,
  breakdown: {
    keyword_match: 0,
    similarity: 0,
    bullet_strength: 0,
    section_score: 0,
    format_score: 0,
    readability: 0,
  },
  missing_keywords: [],
};

function normalizeResume(resume) {
  if (!resume) {
    return null;
  }

  return {
    ...resume,
    template: resume.template || "classic",
    data: {
      ...(resume.data || {}),
      summary: resume.data?.summary || "",
      experience: Array.isArray(resume.data?.experience) ? resume.data.experience : [],
      projects: Array.isArray(resume.data?.projects) ? resume.data.projects : [],
      skills: Array.isArray(resume.data?.skills) ? resume.data.skills : [],
    },
  };
}

function replaceFirstOccurrence(source, search, replacement) {
  if (!search) {
    return replacement;
  }

  const index = source.indexOf(search);
  if (index === -1) {
    return replacement;
  }

  return `${source.slice(0, index)}${replacement}${source.slice(index + search.length)}`;
}

function createMessage(role, content) {
  return {
    id: `${role}-${safeRandomUUID()}`,
    role,
    content,
  };
}

function scorePayloadEquals(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

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

export default function Playground() {
  const navigate = useNavigate();
  const { id } = useParams();
  const scoreRequestRef = useRef(0);
  const previewRequestRef = useRef(0);
  const previewUrlRef = useRef("");
  const saveTimeoutRef = useRef(null);
  const deltaTimeoutRef = useRef(null);

  const [currentResume, setCurrentResume] = useState(() =>
    normalizeResume(getResumes().find((entry) => entry.id === id)),
  );
  const [profile, setProfile] = useState(() => getProfile());
  const [titleDraft, setTitleDraft] = useState(() =>
    normalizeResume(getResumes().find((entry) => entry.id === id))?.title || "",
  );
  const [selectedText, setSelectedText] = useState("");
  const [selectionMeta, setSelectionMeta] = useState(null);
  const [jobDescription, setJobDescription] = useState(() =>
    safeGetItem(`${JD_STORAGE_PREFIX}${id}`, "") || "",
  );
  const [experienceLevel, setExperienceLevel] = useState(() =>
    safeGetItem(`mantis-playground-level-${id}`, "Intermediate") || "Intermediate",
  );
  const [targetRole, setTargetRole] = useState(() =>
    safeGetItem(`mantis-playground-role-${id}`, "") || "",
  );
  const [mode, setMode] = useState("preview");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [previewPdfUrl, setPreviewPdfUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [scoreData, setScoreData] = useState(() => ({
    ...EMPTY_SCORE,
    score: normalizeResume(getResumes().find((entry) => entry.id === id))?.ats_score ?? 0,
  }));
  const [messages, setMessages] = useState(() => [
    createMessage("assistant", "Select a bullet in your resume and I can help improve it."),
  ]);
  const [actionLoadingKey, setActionLoadingKey] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isScoreLoading, setIsScoreLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState("");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [scoreDelta, setScoreDelta] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isPowerLoading, setIsPowerLoading] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [accentColor, setAccentColor] = useState(() => {
    const stored = getResumes().find((e) => e.id === id);
    return stored?.accent_color || "#16a34a";
  });

  useEffect(() => {
    const nextResume = normalizeResume(getResumes().find((entry) => entry.id === id));
    setCurrentResume(nextResume);
    setProfile(getProfile());
    setTitleDraft(nextResume?.title || "");
    setSelectedText("");
    setSelectionMeta(null);
    setJobDescription(safeGetItem(`${JD_STORAGE_PREFIX}${id}`, "") || "");
    setExperienceLevel(safeGetItem(`mantis-playground-level-${id}`, "Intermediate") || "Intermediate");
    setTargetRole(safeGetItem(`mantis-playground-role-${id}`, "") || "");
    setMode("preview");
    setShowTemplates(false);
    setShowChat(true);
    setPreviewPdfUrl("");
    setPreviewLoading(false);
    setPreviewError("");
    setScoreData({
      ...EMPTY_SCORE,
      score: nextResume?.ats_score ?? 0,
    });
    setMessages([createMessage("assistant", "Select a bullet in your resume and I can help improve it.")]);
    setActionLoadingKey("");
    setIsChatLoading(false);
    setIsScoreLoading(false);
    setExportLoading("");
    setSaveStatus("saved");
    setScoreDelta(0);
    setErrorMessage("");
    setSuccessMessage("");
    setIsOptimizing(false);
    setIsPowerLoading(false);
    setShowDownloadMenu(false);
    setAccentColor(nextResume?.accent_color || "#16a34a");
  }, [id]);

  useEffect(() => {
    safeSetItem(`${JD_STORAGE_PREFIX}${id}`, jobDescription);
    safeSetItem(`mantis-playground-level-${id}`, experienceLevel);
    safeSetItem(`mantis-playground-role-${id}`, targetRole);
  }, [id, jobDescription, experienceLevel, targetRole]);

  useEffect(() => {
    const syncProfile = () => setProfile(getProfile());
    window.addEventListener("focus", syncProfile);
    window.addEventListener("storage", syncProfile);

    return () => {
      window.removeEventListener("focus", syncProfile);
      window.removeEventListener("storage", syncProfile);
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setErrorMessage(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [errorMessage]);

  useEffect(() => {
    if (!successMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setSuccessMessage(""), 1800);
    return () => window.clearTimeout(timeout);
  }, [successMessage]);

  useEffect(
    () => () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      if (deltaTimeoutRef.current) {
        window.clearTimeout(deltaTimeoutRef.current);
      }
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    },
    [],
  );

  const persistResume = useCallback((resume, options = {}) => {
    const touchTimestamp = options.touchTimestamp ?? true;
    const nextResume = touchTimestamp
      ? { ...resume, last_updated: new Date().toISOString() }
      : resume;

    if (options.markSaving !== false) {
      setSaveStatus("saving");
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = window.setTimeout(() => {
        setSaveStatus("saved");
      }, 220);
    }

    const existingResumes = getResumes();
    let found = false;
    const updatedResumes = existingResumes.map((entry) => {
      if (entry.id !== nextResume.id) {
        return entry;
      }
      found = true;
      return nextResume;
    });

    saveResumes(found ? updatedResumes : [nextResume, ...existingResumes]);
    return nextResume;
  }, []);

  const commitResumeUpdate = useCallback(
    (updater, options = {}) => {
      setCurrentResume((previousResume) => {
        if (!previousResume) {
          return previousResume;
        }

        const nextResume = updater(previousResume);
        if (!nextResume) {
          return previousResume;
        }

        return persistResume(nextResume, options);
      });
    },
    [persistResume],
  );

  const handleSelectText = useCallback((meta, value) => {
    setSelectionMeta(meta);
    setSelectedText(value?.trim() || "");
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectionMeta(null);
    setSelectedText("");
  }, []);

  const handleTitleCommit = useCallback(() => {
    if (!currentResume) {
      return;
    }

    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === currentResume.title) {
      setTitleDraft(currentResume.title);
      return;
    }

    commitResumeUpdate((resume) => ({
      ...resume,
      title: nextTitle,
    }));
    setSuccessMessage("Title updated");
  }, [commitResumeUpdate, currentResume, titleDraft]);

  const handleSummaryChange = useCallback(
    (value) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          summary: value,
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleExperienceRoleChange = useCallback(
    (expIndex, value) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          experience: resume.data.experience.map((item, index) =>
            index === expIndex ? { ...item, role: value } : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleExperienceCompanyChange = useCallback(
    (expIndex, value) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          experience: resume.data.experience.map((item, index) =>
            index === expIndex ? { ...item, company: value } : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleExperienceBulletChange = useCallback(
    (expIndex, bulletIndex, value) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          experience: resume.data.experience.map((item, index) =>
            index === expIndex
              ? {
                  ...item,
                  points: item.points.map((point, pointIndex) =>
                    pointIndex === bulletIndex ? value : point,
                  ),
                }
              : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleProjectNameChange = useCallback(
    (projectIndex, value) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          projects: resume.data.projects.map((item, index) =>
            index === projectIndex ? { ...item, name: value } : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleProjectBulletChange = useCallback(
    (projectIndex, bulletIndex, value) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          projects: resume.data.projects.map((item, index) =>
            index === projectIndex
              ? {
                  ...item,
                  points: item.points.map((point, pointIndex) =>
                    pointIndex === bulletIndex ? value : point,
                  ),
                }
              : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleSkillsChange = useCallback(
    (value) => {
      const nextSkills = value
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean);

      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          skills: nextSkills,
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleAddExperience = useCallback(() => {
    commitResumeUpdate((resume) => ({
      ...resume,
      data: {
        ...resume.data,
        experience: [
          ...resume.data.experience,
          {
            role: "New Experience",
            company: "Company",
            points: ["Describe the measurable outcome you created in this role."],
          },
        ],
      },
    }));
  }, [commitResumeUpdate]);

  const handleAddExperienceBullet = useCallback(
    (expIndex) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          experience: resume.data.experience.map((item, index) =>
            index === expIndex
              ? {
                  ...item,
                  points: [...item.points, "Add another impact-focused bullet for this experience."],
                }
              : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleRemoveExperience = useCallback(
    (expIndex) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          experience: resume.data.experience.filter((_, index) => index !== expIndex),
        },
      }));
      handleClearSelection();
    },
    [commitResumeUpdate, handleClearSelection],
  );

  const handleRemoveExperienceBullet = useCallback(
    (expIndex, bulletIndex) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          experience: resume.data.experience.map((item, index) =>
            index === expIndex
              ? {
                  ...item,
                  points: item.points.filter((_, pointIndex) => pointIndex !== bulletIndex),
                }
              : item,
          ),
        },
      }));
      handleClearSelection();
    },
    [commitResumeUpdate, handleClearSelection],
  );

  const handleAddProject = useCallback(() => {
    commitResumeUpdate((resume) => ({
      ...resume,
      data: {
        ...resume.data,
        projects: [
          ...resume.data.projects,
          {
            name: "New Project",
            points: ["Describe the project and the result it delivered."],
          },
        ],
      },
    }));
  }, [commitResumeUpdate]);

  const handleAddProjectBullet = useCallback(
    (projectIndex) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          projects: resume.data.projects.map((item, index) =>
            index === projectIndex
              ? {
                  ...item,
                  points: [...item.points, "Add a project bullet with clear scope and measurable value."],
                }
              : item,
          ),
        },
      }));
    },
    [commitResumeUpdate],
  );

  const handleRemoveProject = useCallback(
    (projectIndex) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          projects: resume.data.projects.filter((_, index) => index !== projectIndex),
        },
      }));
      handleClearSelection();
    },
    [commitResumeUpdate, handleClearSelection],
  );

  const handleRemoveProjectBullet = useCallback(
    (projectIndex, bulletIndex) => {
      commitResumeUpdate((resume) => ({
        ...resume,
        data: {
          ...resume.data,
          projects: resume.data.projects.map((item, index) =>
            index === projectIndex
              ? {
                  ...item,
                  points: item.points.filter((_, pointIndex) => pointIndex !== bulletIndex),
                }
              : item,
          ),
        },
      }));
      handleClearSelection();
    },
    [commitResumeUpdate, handleClearSelection],
  );

  const applySelectedTextUpdate = useCallback(
    (updatedText) => {
      if (!selectionMeta || !selectedText) {
        return;
      }

      commitResumeUpdate((resume) => {
        if (selectionMeta.section === "summary") {
          return {
            ...resume,
            data: {
              ...resume.data,
              summary: replaceFirstOccurrence(resume.data.summary, selectedText, updatedText),
            },
          };
        }

        if (selectionMeta.section === "experience" && selectionMeta.field === "bullet") {
          return {
            ...resume,
            data: {
              ...resume.data,
              experience: resume.data.experience.map((item, index) =>
                index === selectionMeta.itemIndex
                  ? {
                      ...item,
                      points: item.points.map((point, pointIndex) =>
                        pointIndex === selectionMeta.bulletIndex
                          ? replaceFirstOccurrence(point, selectedText, updatedText)
                          : point,
                      ),
                    }
                  : item,
              ),
            },
          };
        }

        if (selectionMeta.section === "project" && selectionMeta.field === "bullet") {
          return {
            ...resume,
            data: {
              ...resume.data,
              projects: resume.data.projects.map((item, index) =>
                index === selectionMeta.itemIndex
                  ? {
                      ...item,
                      points: item.points.map((point, pointIndex) =>
                        pointIndex === selectionMeta.bulletIndex
                          ? replaceFirstOccurrence(point, selectedText, updatedText)
                          : point,
                      ),
                    }
                  : item,
              ),
            },
          };
        }

        if (selectionMeta.section === "experience" && selectionMeta.field === "role") {
          return {
            ...resume,
            data: {
              ...resume.data,
              experience: resume.data.experience.map((item, index) =>
                index === selectionMeta.itemIndex
                  ? { ...item, role: replaceFirstOccurrence(item.role, selectedText, updatedText) }
                  : item,
              ),
            },
          };
        }

        if (selectionMeta.section === "experience" && selectionMeta.field === "company") {
          return {
            ...resume,
            data: {
              ...resume.data,
              experience: resume.data.experience.map((item, index) =>
                index === selectionMeta.itemIndex
                  ? { ...item, company: replaceFirstOccurrence(item.company, selectedText, updatedText) }
                  : item,
              ),
            },
          };
        }

        if (selectionMeta.section === "project" && selectionMeta.field === "name") {
          return {
            ...resume,
            data: {
              ...resume.data,
              projects: resume.data.projects.map((item, index) =>
                index === selectionMeta.itemIndex
                  ? { ...item, name: replaceFirstOccurrence(item.name, selectedText, updatedText) }
                  : item,
              ),
            },
          };
        }

        if (selectionMeta.section === "skills") {
          return {
            ...resume,
            data: {
              ...resume.data,
              skills: replaceFirstOccurrence(resume.data.skills.join(", "), selectedText, updatedText)
                .split(/[,\n]/)
                .map((entry) => entry.trim())
                .filter(Boolean),
            },
          };
        }

        return resume;
      });

      setSelectedText(updatedText);
    },
    [commitResumeUpdate, selectedText, selectionMeta],
  );

  const handleBulletAction = useCallback(
    async (section, itemIndex, bulletIndex, action) => {
      if (!currentResume) {
        return;
      }

      if (!jobDescription.trim()) {
        setErrorMessage("Add a job target in AI Assistant before using bullet actions.");
        return;
      }

      const apiKey = getStoredApiKey();
      if (!apiKey.trim()) {
        setErrorMessage("Add your API key in API Key Settings before using AI actions.");
        return;
      }

      const instructionMap = {
        improve: null,
        shorten: "Shorten this bullet while preserving the strongest measurable impact.",
        "add-impact": "Add stronger impact language and a concrete business result if justified.",
      };

      const key = `${section}:${itemIndex}:${bulletIndex}:${action}`;
      setActionLoadingKey(key);

      try {
        const updatedResume = await updateBullet({
          resume: currentResume,
          section,
          itemIndex,
          bulletIndex,
          instruction: instructionMap[action],
          jobDescription,
          apiKey,
          experienceLevel,
          targetRole,
        });

        startTransition(() => {
          const persisted = persistResume(updatedResume, { touchTimestamp: false, markSaving: false });
          setCurrentResume(persisted);
          const updatedBullet =
            section === "experience"
              ? persisted.data.experience[itemIndex]?.points[bulletIndex] || ""
              : persisted.data.projects[itemIndex]?.points[bulletIndex] || "";
          setSelectedText(updatedBullet);
          setSelectionMeta({ section, itemIndex, bulletIndex, field: "bullet" });
          setSuccessMessage("Bullet updated");
        });
      } catch (error) {
        setErrorMessage(error.message || "Unable to update bullet right now.");
      } finally {
        setActionLoadingKey("");
      }
    },
    [currentResume, jobDescription, persistResume],
  );

  const handleFieldAction = useCallback(
    async (meta, action, fallbackValue) => {
      if (!currentResume) {
        return;
      }

      if (!jobDescription.trim()) {
        setErrorMessage("Add a job target in AI Assistant before using AI actions.");
        return;
      }

      const apiKey = getStoredApiKey();
      if (!apiKey.trim()) {
        setErrorMessage("Add your API key in API Key Settings before using AI actions.");
        return;
      }

      const instructionMap = {
        improve: "Improve this text for clarity, impact, and professionalism while preserving the original meaning.",
        shorten: "Shorten this text while keeping the strongest meaning and tone.",
        "add-impact": "Add stronger impact language and more concrete outcomes if justified.",
      };

      const nextSelectedText = selectedText || fallbackValue || "";
      const key = `${meta.section}:${meta.itemIndex ?? "x"}:${meta.field}:${action}`;
      setActionLoadingKey(key);
      setSelectionMeta(meta);
      setSelectedText(nextSelectedText);

      try {
        const response = await chatEdit({
          resume: currentResume,
          instruction: instructionMap[action],
          selectedText: nextSelectedText,
          jobDescription,
          apiKey,
          experienceLevel,
          targetRole,
        });

        const updatedText = response.updated_text;
        if (updatedText && updatedText !== nextSelectedText) {
          applySelectedTextUpdate(updatedText);
          setSuccessMessage("Section updated");
        }
      } catch (error) {
        setErrorMessage(error.message || "Unable to update this section right now.");
      } finally {
        setActionLoadingKey("");
      }
    },
    [applySelectedTextUpdate, currentResume, jobDescription, selectedText],
  );

  const handleSendChat = useCallback(
    async (instruction) => {
      if (!currentResume) {
        return false;
      }
      if (!selectedText || !selectionMeta) {
        setErrorMessage("Select a specific part of the resume before sending a chat edit.");
        return false;
      }
      if (!jobDescription.trim()) {
        setErrorMessage("Add a job target before using chat edits.");
        return false;
      }

      const apiKey = getStoredApiKey();
      if (!apiKey.trim()) {
        setErrorMessage("Add your API key in API Key Settings before using chat edits.");
        return false;
      }

      const userMessage = createMessage("user", instruction);
      setMessages((previousMessages) => [...previousMessages, userMessage]);
      setIsChatLoading(true);

      try {
        const response = await chatEdit({
          resume: currentResume,
          instruction,
          selectedText,
          jobDescription,
          apiKey,
          experienceLevel,
          targetRole,
        });
        const updatedText = response.updated_text;
        applySelectedTextUpdate(updatedText);
        setMessages((previousMessages) => [...previousMessages, createMessage("assistant", updatedText)]);
        setSuccessMessage("Selected text updated");
        return true;
      } catch (error) {
        setErrorMessage(error.message || "Unable to apply chat edit right now.");
        return false;
      } finally {
        setIsChatLoading(false);
      }
    },
    [applySelectedTextUpdate, currentResume, jobDescription, selectedText, selectionMeta],
  );

  const handleDownload = useCallback(
    async (type) => {
      if (!currentResume) {
        return;
      }

      setExportLoading(type);

      try {
        const result =
          type === "docx"
            ? await downloadDocx({ resume: currentResume, profile })
            : await downloadPdf({ resume: currentResume, profile });

        triggerBlobDownload(result.blob, result.filename);
        setSuccessMessage(type === "docx" ? "DOCX downloaded" : "PDF downloaded");
      } catch (error) {
        setErrorMessage(error.message || "Unable to generate export right now.");
      } finally {
        setExportLoading("");
      }
    },
    [currentResume, profile],
  );

  const handleSyncProfileButton = useCallback(async () => {
    const freshProfile = getProfile();
    setProfile(freshProfile);
    setErrorMessage("");
    setSuccessMessage("");
    
    const apiKey = getStoredApiKey();
    if (!apiKey || !apiKey.trim()) {
      setSuccessMessage("Synced basic info. (Add API key for perfect resume struct syncing)");
      setTimeout(() => setSuccessMessage(""), 3000);
      return;
    }
    
    setExportLoading("sync");
    try {
      const syncedData = await syncProfile({
        resume: currentResume,
        profile: freshProfile,
        apiKey,
      });
      commitResumeUpdate((resume) => ({ ...resume, data: syncedData }), "Synced My Info completely");
      setSuccessMessage("Profile completely synced into resume structure!");
      setTimeout(() => setSuccessMessage(""), 3000);
    } catch (error) {
      setErrorMessage(error.message || "Failed to fully sync profile to resume.");
    } finally {
      setExportLoading((prev) => (prev === "sync" ? "" : prev));
    }
  }, [currentResume, commitResumeUpdate]);

  const handleTemplateChange = useCallback(
    (template) => {
      startTransition(() => {
        commitResumeUpdate(
          (resume) => ({
            ...resume,
            template,
          }),
          { markSaving: false },
        );
      });
      setSaveStatus("saved");
    },
    [commitResumeUpdate],
  );

  const handleAccentColorChange = useCallback(
    (color) => {
      setAccentColor(color);
      commitResumeUpdate(
        (resume) => ({ ...resume, accent_color: color }),
        { markSaving: false },
      );
    },
    [commitResumeUpdate],
  );

  const handleOptimizeAll = useCallback(async () => {
    if (!currentResume) return;
    const apiKey = getStoredApiKey();
    if (!apiKey?.trim()) {
      setErrorMessage("Add your API key in Settings before using Optimize All.");
      return;
    }
    setIsOptimizing(true);
    setErrorMessage("");
    try {
      const freshProfile = getProfile();
      const optimizedData = await optimizeResume({
        resume: currentResume,
        jobDescription,
        profile: freshProfile,
        apiKey,
        experienceLevel,
        targetRole,
      });
      commitResumeUpdate((resume) => ({ ...resume, data: optimizedData }));
      setSuccessMessage("Resume fully optimized! ATS score will update shortly.");
    } catch (error) {
      setErrorMessage(error.message || "Optimization failed. Try again.");
    } finally {
      setIsOptimizing(false);
    }
  }, [currentResume, commitResumeUpdate, jobDescription]);

  const handleManualAtsCheck = useCallback(async () => {
    if (!currentResume) return;
    const requestId = scoreRequestRef.current + 1;
    scoreRequestRef.current = requestId;
    setIsScoreLoading(true);
    try {
      const nextScore = await getScore({
        resume: currentResume,
        jobDescription,
      });
      if (scoreRequestRef.current !== requestId) return;
      startTransition(() => {
        setScoreData(nextScore);
        setCurrentResume((prev) => {
          if (!prev) return prev;
          if (prev.ats_score === nextScore.score) return prev;
          return persistResume({ ...prev, ats_score: nextScore.score }, { touchTimestamp: false, markSaving: false });
        });
      });
    } catch (error) {
      setErrorMessage(error.message || "Unable to refresh ATS score.");
    } finally {
      if (scoreRequestRef.current === requestId) setIsScoreLoading(false);
    }
  }, [currentResume, jobDescription, persistResume]);

  const handlePowerGenerate = useCallback(async () => {
    if (!currentResume) return;
    const apiKey = getStoredApiKey();
    if (!apiKey?.trim()) {
      setErrorMessage("Add your API key in Settings to use Power Generate.");
      return;
    }
    setIsPowerLoading(true);
    setErrorMessage("");
    try {
      const freshProfile = getProfile();
      const powerData = await powerGenerate({
        resume: currentResume,
        jobDescription,
        profile: freshProfile,
        apiKey,
        experienceLevel,
        targetRole,
      });
      commitResumeUpdate((resume) => ({ ...resume, data: powerData }));
      setMode("preview");
      setSuccessMessage("⚡ Perfect ATS resume generated! PDF preview is updating.");
    } catch (error) {
      setErrorMessage(error.message || "Power generation failed.");
    } finally {
      setIsPowerLoading(false);
    }
  }, [currentResume, commitResumeUpdate, jobDescription, experienceLevel, targetRole]);

  useEffect(() => {
    if (mode !== "preview" || !currentResume) {
      setPreviewLoading(false);
      setPreviewError("");
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const requestId = previewRequestRef.current + 1;
      previewRequestRef.current = requestId;
      setPreviewLoading(true);
      setPreviewError("");

      try {
        const result = await downloadPdf({
          resume: currentResume,
          profile,
        });

        if (previewRequestRef.current !== requestId) {
          return;
        }

        if (previewUrlRef.current) {
          URL.revokeObjectURL(previewUrlRef.current);
        }

        const objectUrl = URL.createObjectURL(result.blob);
        previewUrlRef.current = objectUrl;
        setPreviewPdfUrl(objectUrl);
      } catch (error) {
        if (previewRequestRef.current === requestId) {
          setPreviewPdfUrl("");
          setPreviewError(error.message || "Unable to generate PDF preview.");
        }
      } finally {
        if (previewRequestRef.current === requestId) {
          setPreviewLoading(false);
        }
      }
    }, 260);

    return () => window.clearTimeout(timeout);
  }, [currentResume, mode, profile]);

  useEffect(() => {
    if (!currentResume) {
      return undefined;
    }
    if (!jobDescription.trim()) {
      setIsScoreLoading(false);
      startTransition(() => {
        setScoreData((previousScore) => ({
          ...previousScore,
          score: currentResume.ats_score ?? 0,
        }));
      });
      return undefined;
    }

    const timeout = window.setTimeout(async () => {
      const requestId = scoreRequestRef.current + 1;
      scoreRequestRef.current = requestId;
      setIsScoreLoading(true);

      try {
        const nextScore = await getScore({
          resume: currentResume,
          jobDescription,
        });

        if (scoreRequestRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setScoreData((previousScore) => {
            if (scorePayloadEquals(previousScore, nextScore)) {
              return previousScore;
            }

            const delta = nextScore.score - (previousScore?.score ?? 0);
            if (delta > 0) {
              setScoreDelta(delta);
              if (deltaTimeoutRef.current) {
                window.clearTimeout(deltaTimeoutRef.current);
              }
              deltaTimeoutRef.current = window.setTimeout(() => setScoreDelta(0), 1800);
            }

            return nextScore;
          });
          setCurrentResume((previousResume) => {
            if (!previousResume) {
              return previousResume;
            }
            if (previousResume.ats_score === nextScore.score) {
              return previousResume;
            }
            return persistResume(
              {
                ...previousResume,
                ats_score: nextScore.score,
              },
              { touchTimestamp: false, markSaving: false },
            );
          });
        });
      } catch (error) {
        if (scoreRequestRef.current === requestId) {
          setErrorMessage(error.message || "Unable to refresh ATS score.");
        }
      } finally {
        if (scoreRequestRef.current === requestId) {
          setIsScoreLoading(false);
        }
      }
    }, 420);

    return () => window.clearTimeout(timeout);
  }, [currentResume?.data, jobDescription, persistResume]);

  // Auto ATS check every 60 seconds
  useEffect(() => {
    if (!currentResume || !jobDescription.trim()) return undefined;
    const interval = window.setInterval(async () => {
      try {
        const nextScore = await getScore({ resume: currentResume, jobDescription });
        startTransition(() => {
          setScoreData(nextScore);
          setCurrentResume((prev) => {
            if (!prev || prev.ats_score === nextScore.score) return prev;
            return persistResume({ ...prev, ats_score: nextScore.score }, { touchTimestamp: false, markSaving: false });
          });
        });
      } catch (_) {
        // silent auto-check failure
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [currentResume, jobDescription, persistResume]);

  const statusTone = saveStatus === "saving" ? "saving" : "saved";
  const hasApiKey = Boolean(getStoredApiKey().trim());
  const selectionStatus = selectionMeta ? "Selection active" : "No selection";
  const targetStatus = jobDescription.trim() ? "Job target attached" : "Add a job target";

  if (!currentResume) {
    return null;
  }

  return (
    <section className="workspace-page">
      <header className="workspace-topbar">
        <div className="workspace-topbar__title-block">
          <div className="workspace-topbar__title">
            <input
              className="workspace-title-input"
              onBlur={handleTitleCommit}
              onChange={(event) => setTitleDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              type="text"
              value={titleDraft}
            />
            <span className={`workspace-topbar__status workspace-topbar__status--${statusTone}`}>
              ○ {saveStatus === "saving" ? "Saving" : "Saved"}
            </span>
          </div>
          <div className="workspace-topbar__meta">
            <span className="page-meta-pill">{currentResume.template === "modern" ? "Modern" : "Classic"} template</span>
            <span className="page-meta-pill">{selectionStatus}</span>
            <span className="page-meta-pill">{targetStatus}</span>
            <span className="page-meta-pill">{hasApiKey ? "AI ready" : "Add API key"}</span>
          </div>
        </div>

        <div className="workspace-topbar__actions">
          <button
            className={`workspace-action ${mode === "preview" ? "workspace-action--active" : ""}`}
            onClick={() => setMode((current) => (current === "edit" ? "preview" : "edit"))}
            type="button"
          >
            {mode === "edit" ? "Preview" : "Edit"}
          </button>
          <button
            className={`workspace-action ${showTemplates ? "workspace-action--active" : ""}`}
            onClick={() => setShowTemplates((current) => !current)}
            type="button"
          >
            Template
          </button>
          <div className="workspace-download-group">
            <button
              className={`workspace-action workspace-action--primary ${exportLoading ? "workspace-action--loading" : ""}`}
              onClick={() => setShowDownloadMenu((v) => !v)}
              type="button"
            >
              {exportLoading ? "Exporting..." : "↓ Download"}
            </button>
            {showDownloadMenu && (
              <div className="workspace-download-menu">
                <button onClick={() => { setShowDownloadMenu(false); handleDownload("pdf"); }} type="button">PDF</button>
                <button onClick={() => { setShowDownloadMenu(false); handleDownload("docx"); }} type="button">DOCX</button>
              </div>
            )}
          </div>
          <button
            className={`workspace-action ${showChat ? "workspace-action--active" : ""}`}
            onClick={() => setShowChat((current) => !current)}
            type="button"
          >
            AI Chat
          </button>
          <button className={`workspace-action ${exportLoading === "sync" ? "workspace-action--loading" : ""}`} onClick={handleSyncProfileButton} type="button">
            {exportLoading === "sync" ? "Syncing..." : "Sync My Info"}
          </button>
        </div>
      </header>

      {showTemplates ? (
        <div className="workspace-template-row">
          <TemplateSelector
            value={currentResume.template}
            accentColor={accentColor}
            onChange={handleTemplateChange}
            onColorChange={handleAccentColorChange}
          />
        </div>
      ) : null}

      {errorMessage ? <div className="workspace-flash workspace-flash--error">{errorMessage}</div> : null}
      {successMessage ? <div className="workspace-flash workspace-flash--success">{successMessage}</div> : null}

      <div className={`workspace-body ${showChat ? "" : "workspace-body--full"}`}>
        <Canvas
          resume={currentResume}
          profile={profile}
          selectionMeta={selectionMeta}
          selectedText={selectedText}
          actionLoadingKey={actionLoadingKey}
          template={currentResume.template}
          mode={mode}
          previewPdfUrl={previewPdfUrl}
          previewLoading={previewLoading}
          previewError={previewError}
          onToggleMode={setMode}
          onSelectText={handleSelectText}
          onSummaryChange={handleSummaryChange}
          onExperienceRoleChange={handleExperienceRoleChange}
          onExperienceCompanyChange={handleExperienceCompanyChange}
          onExperienceBulletChange={handleExperienceBulletChange}
          onProjectNameChange={handleProjectNameChange}
          onProjectBulletChange={handleProjectBulletChange}
          onSkillsChange={handleSkillsChange}
          onAddExperience={handleAddExperience}
          onAddExperienceBullet={handleAddExperienceBullet}
          onAddProject={handleAddProject}
          onAddProjectBullet={handleAddProjectBullet}
          onRemoveExperience={handleRemoveExperience}
          onRemoveExperienceBullet={handleRemoveExperienceBullet}
          onRemoveProject={handleRemoveProject}
          onRemoveProjectBullet={handleRemoveProjectBullet}
          onBulletAction={handleBulletAction}
          onFieldAction={handleFieldAction}
          onClearSelection={handleClearSelection}
        />

        {showChat ? (
          <Chat
            messages={messages}
            selectionMeta={selectionMeta}
            selectedText={selectedText}
            jobDescription={jobDescription}
            onJobDescriptionChange={setJobDescription}
            experienceLevel={experienceLevel}
            onExperienceLevelChange={setExperienceLevel}
            targetRole={targetRole}
            onTargetRoleChange={setTargetRole}
            onSend={handleSendChat}
            onOptimizeAll={handleOptimizeAll}
            onManualAtsCheck={handleManualAtsCheck}
            isLoading={isChatLoading}
            isOptimizing={isOptimizing}
            hasApiKey={hasApiKey}
            statusMessage={errorMessage}
            atsScore={scoreData.score}
            weakWords={scoreData.weak_words_used || []}
          />
        ) : null}
      </div>

      <ATSPanel
        scoreData={scoreData}
        isLoading={isScoreLoading}
        scoreDelta={scoreDelta}
        jobDescription={jobDescription}
        onManualCheck={handleManualAtsCheck}
        onPowerGenerate={handlePowerGenerate}
        isPowerLoading={isPowerLoading}
      />
    </section>
  );
}
