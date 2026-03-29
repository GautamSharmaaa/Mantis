export function safeGetItem(key, fallback = null) {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRandomUUID() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const randomValue = Math.floor(Math.random() * 16);
    const value = character === "x" ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });
}
