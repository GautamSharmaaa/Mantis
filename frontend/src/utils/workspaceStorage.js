import { safeGetItem, safeSetItem } from "./browser";

const PROFILE_KEY = "mantis-profile";
const API_KEY_STORAGE = "mantis-api-key";

export const DEFAULT_PROFILE = {
  fullName: "Alex Johnson",
  email: "alex@email.com",
  phone: "(555) 123-4567",
  location: "San Francisco, CA",
  jobTitle: "Senior Software Engineer",
  website: "alexjohnson.dev",
  linkedin: "linkedin.com/in/alexj",
  github: "github.com/alexj",
  summary:
    "Full-stack engineer with 5+ years building scalable web applications and AI-powered products.",
  experience:
    "Led development of AI-powered tools, architected platform migrations, and mentored engineers across product teams.",
  skills: "React, Node.js, Python, FastAPI, TypeScript",
};

export function normalizeProfile(profile) {
  return {
    ...DEFAULT_PROFILE,
    ...(profile || {}),
  };
}

export function getProfile() {
  const raw = safeGetItem(PROFILE_KEY);
  if (!raw) {
    return normalizeProfile();
  }

  try {
    const parsed = JSON.parse(raw);
    return normalizeProfile(parsed);
  } catch {
    return normalizeProfile();
  }
}

export function saveProfile(profile) {
  safeSetItem(PROFILE_KEY, JSON.stringify(normalizeProfile(profile)));
}

export function getStoredApiKey() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.sessionStorage.getItem(API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function saveStoredApiKey(value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(API_KEY_STORAGE, value || "");
  } catch {}
}
