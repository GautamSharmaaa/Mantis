const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload?.data;
}

async function downloadFile(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const errorPayload = isJson ? await response.json() : null;
    throw new Error(errorPayload?.error || `Request failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename="([^"]+)"/i);

  return {
    blob,
    filename: match?.[1] || "download",
  };
}

async function requestMultipart(path, formData) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload?.data;
}

export function generateResume(payload) {
  return request("/generate", {
    method: "POST",
    body: JSON.stringify({
      resume_text: payload.resumeText,
      job_description: payload.jobDescription || "",
      api_key: payload.apiKey,
      title: payload.title,
      template: payload.template,
    }),
  });
}

export function updateBullet(payload) {
  return request("/update-bullet", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      exp_index: payload.section === "experience" ? payload.itemIndex : null,
      proj_index: payload.section === "project" ? payload.itemIndex : null,
      bullet_index: payload.bulletIndex,
      job_description: payload.jobDescription,
      api_key: payload.apiKey,
      instruction: payload.instruction,
      section: payload.section,
      experience_level: payload.experienceLevel || "Intermediate",
      target_role: payload.targetRole || "",
    }),
  });
}

export function chatEdit(payload) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      instruction: payload.instruction,
      selected_text: payload.selectedText,
      job_description: payload.jobDescription,
      api_key: payload.apiKey,
      experience_level: payload.experienceLevel || "Intermediate",
      target_role: payload.targetRole || "",
    }),
  });
}

export function getScore(payload) {
  return request("/score", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      job_description: payload.jobDescription,
    }),
  });
}

export function downloadDocx(payload) {
  return downloadFile("/download-docx", {
    resume: payload.resume,
    profile: payload.profile,
  });
}

export function downloadPdf(payload) {
  return downloadFile("/download-pdf", {
    resume: payload.resume,
    profile: payload.profile,
  });
}

export function importProfileResume(file, apiKey) {
  const formData = new FormData();
  formData.append("file", file);
  if (apiKey) {
    formData.append("api_key", apiKey);
  }
  return requestMultipart("/import-profile", formData);
}

export function syncProfile(payload) {
  return request("/sync-profile", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      profile: payload.profile,
      api_key: payload.apiKey,
    }),
  });
}

export function optimizeResume(payload) {
  return request("/optimize-resume", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      job_description: payload.jobDescription || "",
      profile: payload.profile || {},
      api_key: payload.apiKey,
      experience_level: payload.experienceLevel || "Intermediate",
      target_role: payload.targetRole || "",
    }),
  });
}

export function powerGenerate(payload) {
  return request("/power-generate", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      job_description: payload.jobDescription || "",
      profile: payload.profile || {},
      api_key: payload.apiKey,
      experience_level: payload.experienceLevel || "Intermediate",
      target_role: payload.targetRole || "",
    }),
  });
}

export function getAiSuggestions(payload) {
  return request("/ai-suggestions", {
    method: "POST",
    body: JSON.stringify({
      resume: payload.resume,
      job_description: payload.jobDescription,
      api_key: payload.apiKey,
      experience_level: payload.experienceLevel || "Intermediate",
      target_role: payload.targetRole || "",
    }),
  });
}
