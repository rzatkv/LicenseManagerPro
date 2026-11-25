import React, {createContext, useContext, useState, useEffect, useCallback} from "react";

const ThemeContext = createContext(null);
const THEME_KEY = "lmp-theme";

function initialMode() {
  try {
    return localStorage.getItem(THEME_KEY) || "auto";
  } catch (e) {
    return "auto";
  }
}

function resolve(mode) {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({children}) {
  const [mode, setModeState] = useState(initialMode);
  const [resolved, setResolved] = useState(() => resolve(initialMode()));

  useEffect(() => {
    const r = resolve(mode);
    setResolved(r);
    document.documentElement.dataset.theme = r;
    try {
      localStorage.setItem(THEME_KEY, mode);
    } catch (e) {}
  }, [mode]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (mode === "auto") {
        const r = resolve("auto");
        setResolved(r);
        document.documentElement.dataset.theme = r;
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, [mode]);

  const setMode = useCallback((m) => setModeState(m), []);
  const cycle = useCallback(() => {
    setModeState((prev) => (prev === "light" ? "dark" : prev === "dark" ? "auto" : "light"));
  }, []);

  return (
    <ThemeContext.Provider value={{mode, resolved, setMode, cycle}}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
