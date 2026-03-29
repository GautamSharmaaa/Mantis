import { useEffect, useState } from "react";

import { safeGetItem, safeSetItem } from "../utils/browser";

const THEME_STORAGE_KEY = "mantis-theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => safeGetItem(THEME_STORAGE_KEY, "dark") || "dark");

  useEffect(() => {
    safeSetItem(THEME_STORAGE_KEY, theme);
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    document.documentElement.classList.toggle("theme-light", theme === "light");
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => (currentTheme === "dark" ? "light" : "dark"));
  };

  return { theme, toggleTheme };
}
