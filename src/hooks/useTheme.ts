import { useState, useEffect } from "react";

type Theme = "dark" | "light";

function getTheme(): Theme {
  return document.documentElement.classList.contains("light") ? "light" : "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") {
      const stored = localStorage.getItem("ckoursePlayer-theme") as Theme | null;
      return stored ?? "light";
    }
    return getTheme();
  });

  // Observe DOM class changes so we stay in sync with AnimatedThemeToggler
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getTheme());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  // Apply initial theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("ckoursePlayer-theme") as Theme | null;
    const effectiveTheme = stored ?? "light";
    if (effectiveTheme === "light") {
      document.documentElement.classList.add("light");
    } else {
      document.documentElement.classList.remove("light");
    }
  }, []);

  return { theme } as const;
}
