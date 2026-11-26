import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from "react";
import {get, put} from "./utils/api";
import {getCurrentUser} from "./utils/auth";

const ThemeContext = createContext(null);
const THEME_KEY = "lmp-theme"; // light | dark | auto (kept from v2.1)
const PRESET_KEY = "lmp-theme-preset"; // default | ocean | forest | sunset | graphite | rose | teal | amber | lime | ruby | custom
const CUSTOM_KEY = "lmp-theme-custom"; // JSON {accent, accent2, bg, surface}

/** Valid theme values (v3.0, per-admin themes). Anything the server
 * returns outside these lists is ignored, never applied. */
export const THEME_PRESET_IDS = ["default", "ocean", "forest", "sunset", "graphite", "rose", "teal", "amber", "lime", "ruby", "custom"];
const THEME_MODES = ["light", "dark", "auto"];
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const CUSTOM_FIELDS = ["accent", "accent2", "bg", "surface"];

/** Keep only the known, well-formed parts of a stored theme value. */
function sanitizeTheme(saved) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return null;
  const out = {};
  if (typeof saved.mode === "string" && THEME_MODES.includes(saved.mode)) out.mode = saved.mode;
  if (typeof saved.preset === "string" && THEME_PRESET_IDS.includes(saved.preset)) out.preset = saved.preset;
  if (saved.custom && typeof saved.custom === "object" && !Array.isArray(saved.custom)) {
    const c = {};
    for (const k of CUSTOM_FIELDS) {
      if (typeof saved.custom[k] === "string" && HEX_RE.test(saved.custom[k])) c[k] = saved.custom[k];
    }
    if (Object.keys(c).length) out.custom = c;
  }
  return Object.keys(out).length ? out : null;
}

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
  {
    id: "rose",
    light: {accent: "#F43F5E", accent2: "#E11D48", accentSoft: "#FFF1F2", gradient: "linear-gradient(135deg, #FB7185, #F43F5E, #E11D48, #DB2777)", hero: "linear-gradient(135deg, #FFE4E6, #FECDD3, #FBCFE8, #F5D0FE)"},
    dark: {accent: "#FB7185", accent2: "#F43F5E", accentSoft: "#3B1220", gradient: "linear-gradient(135deg, #FB7185, #F43F5E, #E11D48, #DB2777)", hero: "linear-gradient(135deg, #2E1218, #33121C, #2A1226, #2E1226)"},
  },
  {
    id: "teal",
    light: {accent: "#0D9488", accent2: "#0F766E", accentSoft: "#CCFBF1", gradient: "linear-gradient(135deg, #2DD4BF, #0D9488, #0F766E, #0369A1)", hero: "linear-gradient(135deg, #CCFBF1, #99F6E4, #A7F3D0, #BAE6FD)"},
    dark: {accent: "#2DD4BF", accent2: "#0D9488", accentSoft: "#0B2E2A", gradient: "linear-gradient(135deg, #2DD4BF, #0D9488, #0F766E, #0369A1)", hero: "linear-gradient(135deg, #0B2622, #0C2E2A, #0B2B28, #0C2436)"},
  },
  {
    id: "amber",
    light: {accent: "#D97706", accent2: "#B45309", accentSoft: "#FEF3C7", gradient: "linear-gradient(135deg, #FBBF24, #D97706, #B45309, #92400E)", hero: "linear-gradient(135deg, #FEF3C7, #FDE68A, #FCD34D, #FDBA74)"},
    dark: {accent: "#FBBF24", accent2: "#D97706", accentSoft: "#33230B", gradient: "linear-gradient(135deg, #FBBF24, #D97706, #B45309, #92400E)", hero: "linear-gradient(135deg, #2E2110, #33230B, #2E2410, #2A1E10)"},
  },
  {
    id: "lime",
    light: {accent: "#65A30D", accent2: "#4D7C0F", accentSoft: "#ECFCCB", gradient: "linear-gradient(135deg, #A3E635, #65A30D, #4D7C0F, #166534)", hero: "linear-gradient(135deg, #ECFCCB, #D9F99D, #BEF264, #86EFAC)"},
    dark: {accent: "#A3E635", accent2: "#65A30D", accentSoft: "#1E2E0C", gradient: "linear-gradient(135deg, #A3E635, #65A30D, #4D7C0F, #166534)", hero: "linear-gradient(135deg, #1A240C, #1E2E0C, #16240E, #10291A)"},
  },
  {
    id: "ruby",
    light: {accent: "#BE123C", accent2: "#9F1239", accentSoft: "#FFE4E6", gradient: "linear-gradient(135deg, #F43F5E, #BE123C, #9F1239, #881337)", hero: "linear-gradient(135deg, #FFE4E6, #FECDD3, #FDA4AF, #F9A8D4)"},
    dark: {accent: "#F87171", accent2: "#BE123C", accentSoft: "#3A0E16", gradient: "linear-gradient(135deg, #F43F5E, #BE123C, #9F1239, #881337)", hero: "linear-gradient(135deg, #2E0E14, #331016, #2A0E18, #2E1218)"},
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
  // Per-admin themes (v3.0): the BACKEND is the source of truth. The
  // user id whose theme has been loaded from the server; the PUT below
  // stays silent until that load has finished for the current user, so
  // a mount can never clobber the server theme with local defaults, and
  // a second admin on the same browser never inherits the first one's
  // theme (localStorage is only a fast first-paint cache).
  const userIdRef = useRef(undefined);
  const serverReadyRef = useRef(false);

  const syncFromServer = useCallback(async () => {
    const user = getCurrentUser();
    if (!user || user.id == null) {
      // Logged out: fall back to the neutral default so the login screen
      // never wears the previous user's theme.
      userIdRef.current = null;
      serverReadyRef.current = false;
      setModeState("auto");
      setPresetState("default");
      setCustomState(DEFAULT_CUSTOM);
      return;
    }
    if (userIdRef.current === user.id && serverReadyRef.current) return;
    userIdRef.current = user.id;
    serverReadyRef.current = false;
    try {
      const data = await get("/users/me/preferences");
      const saved = sanitizeTheme(data && data.preferences && data.preferences.theme);
      if (saved) {
        if (saved.mode) setModeState(saved.mode);
        if (saved.preset) setPresetState(saved.preset);
        if (saved.custom) setCustomState((prev) => ({...prev, ...saved.custom}));
      }
    } catch (e) {
      // Offline / backend down: keep the local cache; a later change
      // still tries to persist (fire-and-forget below).
    }
    serverReadyRef.current = true;
  }, []);

  // Load the logged-in user's theme on mount and whenever the auth
  // state changes (login as another admin, logout).
  useEffect(() => {
    syncFromServer();
    window.addEventListener("lmp-auth-change", syncFromServer);
    return () => window.removeEventListener("lmp-auth-change", syncFromServer);
  }, [syncFromServer]);

  // Apply mode + preset to <html>, persist locally and to the backend.
  useEffect(() => {
    const root = document.documentElement;
    // Smooth animated transition between themes (v3.0.4): the class
    // MUST be added (and a reflow forced) BEFORE the variables change
    // — adding it after setting dataset.theme/preset in the same frame
    // meant the transition was never live when the values changed, so
    // the switch snapped instantly. Skipped entirely when the user
    // prefers reduced motion.
    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduceMotion) {
      root.classList.add("theme-animating");
      void root.offsetWidth; // force reflow: transition is live before the values change
    }
    const r = resolve(mode);
    setResolved(r);
    root.dataset.theme = r;
    root.dataset.preset = preset;
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
    // stores preferences per user in the demo DB). Only after the
    // server theme for THIS user has loaded, and only while logged in:
    // a mount-time PUT would otherwise overwrite the server theme with
    // local defaults, and a logged-out PUT would 401.
    if (serverReadyRef.current && getCurrentUser() && getCurrentUser().id != null) {
      put("/users/me/preferences", {key: "theme", value: {mode, preset, custom}}).catch(() => {});
    }
    return () => clearTimeout(timer);
  }, [mode, preset, custom]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (mode === "auto") {
        const root = document.documentElement;
        // Same animated switch as the main effect (v3.0.4): class +
        // reflow BEFORE the value changes, so an OS theme change
        // cross-fades instead of snapping.
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!reduceMotion) {
          root.classList.add("theme-animating");
          void root.offsetWidth;
          setTimeout(() => root.classList.remove("theme-animating"), 450);
        }
        const r = resolve("auto");
        setResolved(r);
        root.dataset.theme = r;
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
