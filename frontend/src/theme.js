import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from "react";
import {get, put} from "./utils/api";

const ThemeContext = createContext(null);
const THEME_KEY = "lmp-theme"; // light | dark | auto (kept from v2.1)
const PRESET_KEY = "lmp-theme-preset"; // default | ocean | forest | sunset | graphite | custom
const CUSTOM_KEY = "lmp-theme-custom"; // JSON {accent, accent2, bg, surface}

/** Preset colour themes. Each preset overrides the brand variables
 * (--accent, --accent-2, --accent-soft, --accent-gradient, --hero-gradient)
 * defined in index.css, for both light and dark modes. The "default"
 * preset is the magenta/violet glass look from v2.1. */
export const THEME_PRESETS = [
  {
    id: "default",
    light: {accent: "#6D5DF6", accent2: "#5A48E8", accentSoft: "#EDEBFF", gradient: "linear-gradient(135deg, #C1165E, #E56B8F, #6D5DF6, #7B6CFF)", hero: "linear-gradient(135deg, #FFB3E2, #C4A8FF, #8ED8FF, #9FF0E4)"},
    dark: {accent: "#7B6CFF", accent2: "#6D5DF6", accentSoft: "#2B3054", gradient: "linear-gradient(135deg, #C1165E, #E56B8F, #6D5DF6, #7B6CFF)", hero: "linear-gradient(135deg, #3A2B4D, #2C2A55, #1E3A55, #173F3A)"},
  },
  {
    id: "ocean",
    light: {accent: "#0284C7", accent2: "#0369A1", accentSoft: "#E0F2FE", gradient: "linear-gradient(135deg, #0EA5E9, #0284C7, #2563EB, #1D4ED8)", hero: "linear-gradient(135deg, #BAE6FD, #7DD3FC, #93C5FD, #BFDBFE)"},
    dark: {accent: "#38BDF8", accent2: "#0284C7", accentSoft: "#0C2D48", gradient: "linear-gradient(135deg, #0EA5E9, #0284C7, #2563EB, #1D4ED8)", hero: "linear-gradient(135deg, #0C2436, #0F2F4A, #12294D, #0E2A3F)"},
  },
  {
    id: "forest",
    light: {accent: "#16A34A", accent2: "#15803D", accentSoft: "#DCFCE7", gradient: "linear-gradient(135deg, #22C55E, #16A34A, #059669, #0D9488)", hero: "linear-gradient(135deg, #BBF7D0, #86EFAC, #6EE7B7, #99F6E4)"},
    dark: {accent: "#4ADE80", accent2: "#16A34A", accentSoft: "#0F2E1D", gradient: "linear-gradient(135deg, #22C55E, #16A34A, #059669, #0D9488)", hero: "linear-gradient(135deg, #10291A, #0F2E22, #0C2B25, #0F2A24)"},
  },
  {
    id: "sunset",
    light: {accent: "#EA580C", accent2: "#DC2626", accentSoft: "#FFEDD5", gradient: "linear-gradient(135deg, #F97316, #EA580C, #DC2626, #DB2777)", hero: "linear-gradient(135deg, #FED7AA, #FDBA74, #FCA5A5, #F9A8D4)"},
    dark: {accent: "#FB923C", accent2: "#EA580C", accentSoft: "#3A1D0D", gradient: "linear-gradient(135deg, #F97316, #EA580C, #DC2626, #DB2777)", hero: "linear-gradient(135deg, #2E1A0E, #331A10, #2E1414, #2A1420)"},
  },
  {
    id: "graphite",
    light: {accent: "#475569", accent2: "#334155", accentSoft: "#E2E8F0", gradient: "linear-gradient(135deg, #64748B, #475569, #334155, #1E293B)", hero: "linear-gradient(135deg, #E2E8F0, #CBD5E1, #C7D2FE, #E0E7FF)"},
    dark: {accent: "#94A3B8", accent2: "#64748B", accentSoft: "#1E293B", gradient: "linear-gradient(135deg, #64748B, #475569, #334155, #1E293B)", hero: "linear-gradient(135deg, #1E293B, #1A2433, #1B2536, #1C2331)"},
  },
];

export const DEFAULT_CUSTOM = {accent: "#6D5DF6", accent2: "#5A48E8", bg: "#F6F6FB", surface: "#FFFFFF"};

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function initialMode() {
  try { return localStorage.getItem(THEME_KEY) || "auto"; } catch (e) { return "auto"; }
}
function initialPreset() {
  try { return localStorage.getItem(PRESET_KEY) || "default"; } catch (e) { return "default"; }
}

function resolve(mode) {
  if (mode === "dark") return "dark";
  if (mode === "light") return "light";
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({children}) {
  const [mode, setModeState] = useState(initialMode);
  const [preset, setPresetState] = useState(initialPreset);
  const [custom, setCustomState] = useState(() => readJSON(CUSTOM_KEY, DEFAULT_CUSTOM));
  const [resolved, setResolved] = useState(() => resolve(initialMode()));
  const syncedFromServer = useRef(false);

  // Load the saved theme from the backend when logged in (localStorage
  // wins when it already has a value — the user's own device choice).
  useEffect(() => {
    if (syncedFromServer.current) return;
    syncedFromServer.current = true;
    let hasLocal = false;
    try { hasLocal = !!localStorage.getItem(THEME_KEY) || !!localStorage.getItem(PRESET_KEY); } catch (e) {}
    if (hasLocal) return;
    get("/users/me/preferences")
      .then((data) => {
        const saved = data && data.preferences && data.preferences.theme;
        if (!saved) return;
        if (saved.mode) setModeState(saved.mode);
        if (saved.preset) setPresetState(saved.preset);
        if (saved.custom) setCustomState({...DEFAULT_CUSTOM, ...saved.custom});
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply mode + preset to <html>, persist locally and to the backend.
  useEffect(() => {
    const r = resolve(mode);
    setResolved(r);
    const root = document.documentElement;
    root.dataset.theme = r;
    root.dataset.preset = preset;
    // Smooth animated transition between themes.
    root.classList.add("theme-animating");
    const timer = setTimeout(() => root.classList.remove("theme-animating"), 450);
    if (preset === "custom") {
      root.style.setProperty("--accent", custom.accent);
      root.style.setProperty("--accent-2", custom.accent2);
      root.style.setProperty("--accent-gradient", `linear-gradient(135deg, ${custom.accent}, ${custom.accent2})`);
      root.style.setProperty("--accent-soft", `color-mix(in srgb, ${custom.accent} 14%, ${custom.surface})`);
      root.style.setProperty("--hero-gradient", `linear-gradient(135deg, ${custom.accent}, ${custom.accent2})`);
      root.style.setProperty("--bg", custom.bg);
      root.style.setProperty("--surface", custom.surface);
    } else {
      root.style.removeProperty("--accent");
      root.style.removeProperty("--accent-2");
      root.style.removeProperty("--accent-gradient");
      root.style.removeProperty("--accent-soft");
      root.style.removeProperty("--hero-gradient");
      root.style.removeProperty("--bg");
      root.style.removeProperty("--surface");
    }
    try {
      localStorage.setItem(THEME_KEY, mode);
      localStorage.setItem(PRESET_KEY, preset);
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch (e) {}
    // Persist per user on the backend (works in demo mode too — the mock
    // stores preferences in the demo DB). Fire-and-forget; a failure must
    // never break the theme switch.
    put("/users/me/preferences", {key: "theme", value: {mode, preset, custom}}).catch(() => {});
    return () => clearTimeout(timer);
  }, [mode, preset, custom]);

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
  const setPreset = useCallback((p) => setPresetState(p), []);
  const setCustom = useCallback((c) => setCustomState((prev) => ({...prev, ...c})), []);

  return (
    <ThemeContext.Provider value={{mode, resolved, setMode, cycle, preset, setPreset, custom, setCustom}}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
