import React, {createContext, useContext, useState, useEffect, useCallback, useRef} from "react";
import {get, put} from "./utils/api";
import {getCurrentUser} from "./utils/auth";

const ThemeContext = createContext(null);
const THEME_KEY = "lmp-theme"; // light | dark | auto (kept from v2.1)
const PRESET_KEY = "lmp-theme-preset"; // one of THEME_PRESET_IDS (below)
const CUSTOM_KEY = "lmp-theme-custom"; // JSON {accent, accent2, bg, surface}

/** Valid theme values (v3.0, per-admin themes). Anything the server
 * returns outside these lists is ignored, never applied. */
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

/** Preset colour themes. Each preset carries its brand variables
 * (--accent, --accent-2, --accent-soft, --accent-gradient, --hero-gradient)
 * for both light and dark modes; applyPresetVars (below) sets them as
 * inline styles on <html>. The "default" preset is the magenta/violet
 * glass look from v2.1. */
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
  // v3.0.5: 10 more presets (20 total) — every hue distinct from the
  // first 10 and from each other.
  {
    id: "midnight",
    light: {accent: "#4338CA", accent2: "#3730A3", accentSoft: "#E0E7FF", gradient: "linear-gradient(135deg, #6366F1, #4338CA, #3730A3, #1E1B4B)", hero: "linear-gradient(135deg, #E0E7FF, #C7D2FE, #A5B4FC, #C4B5FD)"},
    dark: {accent: "#818CF8", accent2: "#4338CA", accentSoft: "#1A1B3A", gradient: "linear-gradient(135deg, #6366F1, #4338CA, #3730A3, #1E1B4B)", hero: "linear-gradient(135deg, #14142E, #1A1B3A, #16173A, #1B1736)"},
  },
  {
    id: "coral",
    light: {accent: "#F4503C", accent2: "#E11D48", accentSoft: "#FFEBE8", gradient: "linear-gradient(135deg, #FF8A70, #F4503C, #E11D48, #DB2777)", hero: "linear-gradient(135deg, #FFEBE8, #FED7D7, #FECACA, #FBCFE8)"},
    dark: {accent: "#FF8A70", accent2: "#F4503C", accentSoft: "#3A1712", gradient: "linear-gradient(135deg, #FF8A70, #F4503C, #E11D48, #DB2777)", hero: "linear-gradient(135deg, #2E1410, #3A1712, #2E1220, #33121E)"},
  },
  {
    id: "mint",
    light: {accent: "#10B981", accent2: "#047857", accentSoft: "#D1FAE5", gradient: "linear-gradient(135deg, #6EE7B7, #10B981, #047857, #0D9488)", hero: "linear-gradient(135deg, #D1FAE5, #A7F3D0, #6EE7B7, #99F6E4)"},
    dark: {accent: "#34D399", accent2: "#10B981", accentSoft: "#0B2E24", gradient: "linear-gradient(135deg, #6EE7B7, #10B981, #047857, #0D9488)", hero: "linear-gradient(135deg, #0B241C, #0B2E24, #0C2A26, #0B2622)"},
  },
  {
    id: "sky",
    light: {accent: "#38BDF8", accent2: "#0284C7", accentSoft: "#E0F2FE", gradient: "linear-gradient(135deg, #7DD3FC, #38BDF8, #0284C7, #0369A1)", hero: "linear-gradient(135deg, #E0F2FE, #BAE6FD, #7DD3FC, #BFDBFE)"},
    dark: {accent: "#7DD3FC", accent2: "#38BDF8", accentSoft: "#0C2D48", gradient: "linear-gradient(135deg, #7DD3FC, #38BDF8, #0284C7, #0369A1)", hero: "linear-gradient(135deg, #0C2436, #0C2D48, #0E2A3F, #12294D)"},
  },
  {
    id: "plum",
    light: {accent: "#A21CAF", accent2: "#86198F", accentSoft: "#FAE8FF", gradient: "linear-gradient(135deg, #E879F9, #A21CAF, #86198F, #701A75)", hero: "linear-gradient(135deg, #FAE8FF, #F5D0FE, #F0ABFC, #E9D5FF)"},
    dark: {accent: "#E879F9", accent2: "#A21CAF", accentSoft: "#2E0E33", gradient: "linear-gradient(135deg, #E879F9, #A21CAF, #86198F, #701A75)", hero: "linear-gradient(135deg, #2A0E2E, #2E0E33, #2A1230, #2E1233)"},
  },
  {
    id: "gold",
    light: {accent: "#CA8A04", accent2: "#A16207", accentSoft: "#FEF9C3", gradient: "linear-gradient(135deg, #FDE047, #EAB308, #CA8A04, #A16207)", hero: "linear-gradient(135deg, #FEF9C3, #FEF08A, #FDE047, #FCD34D)"},
    dark: {accent: "#FACC15", accent2: "#CA8A04", accentSoft: "#2E250B", gradient: "linear-gradient(135deg, #FDE047, #EAB308, #CA8A04, #A16207)", hero: "linear-gradient(135deg, #2A220E, #2E250B, #2A2110, #2E2410)"},
  },
  {
    id: "crimson",
    light: {accent: "#DC2626", accent2: "#991B1B", accentSoft: "#FEE2E2", gradient: "linear-gradient(135deg, #F87171, #DC2626, #991B1B, #7F1D1D)", hero: "linear-gradient(135deg, #FEE2E2, #FECACA, #FCA5A5, #FDA4AF)"},
    dark: {accent: "#EF4444", accent2: "#DC2626", accentSoft: "#3A0E0E", gradient: "linear-gradient(135deg, #F87171, #DC2626, #991B1B, #7F1D1D)", hero: "linear-gradient(135deg, #2E0E0E, #3A0E0E, #2E1414, #331016)"},
  },
  {
    id: "azure",
    light: {accent: "#2563EB", accent2: "#1D4ED8", accentSoft: "#DBEAFE", gradient: "linear-gradient(135deg, #60A5FA, #2563EB, #1D4ED8, #1E40AF)", hero: "linear-gradient(135deg, #DBEAFE, #BFDBFE, #93C5FD, #C7D2FE)"},
    dark: {accent: "#60A5FA", accent2: "#2563EB", accentSoft: "#0E1E3A", gradient: "linear-gradient(135deg, #60A5FA, #2563EB, #1D4ED8, #1E40AF)", hero: "linear-gradient(135deg, #0E1A2E, #0E1E3A, #101E38, #12294D)"},
  },
  {
    id: "lavender",
    light: {accent: "#8B5CF6", accent2: "#7C3AED", accentSoft: "#EDE9FE", gradient: "linear-gradient(135deg, #C4B5FD, #8B5CF6, #7C3AED, #6D28D9)", hero: "linear-gradient(135deg, #EDE9FE, #DDD6FE, #C4B5FD, #E9D5FF)"},
    dark: {accent: "#A78BFA", accent2: "#8B5CF6", accentSoft: "#1E1733", gradient: "linear-gradient(135deg, #C4B5FD, #8B5CF6, #7C3AED, #6D28D9)", hero: "linear-gradient(135deg, #1A142E, #1E1733, #191430, #201836)"},
  },
  {
    id: "slate",
    light: {accent: "#64748B", accent2: "#475569", accentSoft: "#F1F5F9", gradient: "linear-gradient(135deg, #94A3B8, #64748B, #475569, #334155)", hero: "linear-gradient(135deg, #F1F5F9, #E2E8F0, #CBD5E1, #C7D2FE)"},
    dark: {accent: "#E2E8F0", accent2: "#64748B", accentSoft: "#1E293B", gradient: "linear-gradient(135deg, #94A3B8, #64748B, #475569, #334155)", hero: "linear-gradient(135deg, #1A2433, #1E293B, #1B2536, #1E293B)"},
  },
  // v3.0.5 (40-preset correction): 20 more presets (40 total). Every
  // light accent is distinct from the other 39; dark accents are
  // distinct within this group of 20.
  {
    id: "citrine",
    light: {accent: "#EAB308", accent2: "#CA8A04", accentSoft: "#FEF9C3", gradient: "linear-gradient(135deg, #FDE047, #EAB308, #CA8A04, #A16207)", hero: "linear-gradient(135deg, #FEF9C3, #FEF08A, #FDE047, #FACC15)"},
    dark: {accent: "#FDE047", accent2: "#EAB308", accentSoft: "#33270B", gradient: "linear-gradient(135deg, #FDE047, #EAB308, #CA8A04, #A16207)", hero: "linear-gradient(135deg, #2E250B, #33270B, #2A2210, #241E0B)"},
  },
  {
    id: "cyan",
    light: {accent: "#0891B2", accent2: "#0E7490", accentSoft: "#CFFAFE", gradient: "linear-gradient(135deg, #22D3EE, #0891B2, #0E7490, #155E75)", hero: "linear-gradient(135deg, #CFFAFE, #A5F3FC, #67E8F9, #BAE6FD)"},
    dark: {accent: "#22D3EE", accent2: "#0891B2", accentSoft: "#0B2E33", gradient: "linear-gradient(135deg, #22D3EE, #0891B2, #0E7490, #155E75)", hero: "linear-gradient(135deg, #082A30, #0B2E33, #0A2A30, #0C2436)"},
  },
  {
    id: "pink",
    light: {accent: "#EC4899", accent2: "#DB2777", accentSoft: "#FCE7F3", gradient: "linear-gradient(135deg, #F9A8D4, #EC4899, #DB2777, #BE185D)", hero: "linear-gradient(135deg, #FCE7F3, #FBCFE8, #F9A8D4, #F5D0FE)"},
    dark: {accent: "#F472B6", accent2: "#EC4899", accentSoft: "#33122A", gradient: "linear-gradient(135deg, #F9A8D4, #EC4899, #DB2777, #BE185D)", hero: "linear-gradient(135deg, #2E1226, #33122A, #2A1226, #2E1226)"},
  },
  {
    id: "fuchsia",
    light: {accent: "#C026D3", accent2: "#A21CAF", accentSoft: "#FAE8FF", gradient: "linear-gradient(135deg, #E879F9, #C026D3, #A21CAF, #86198F)", hero: "linear-gradient(135deg, #FAE8FF, #F5D0FE, #E9D5FF, #DDD6FE)"},
    dark: {accent: "#D8B4FE", accent2: "#C026D3", accentSoft: "#2E1233", gradient: "linear-gradient(135deg, #E879F9, #C026D3, #A21CAF, #86198F)", hero: "linear-gradient(135deg, #26122E, #2E1233, #241230, #2A1230)"},
  },
  {
    id: "iris",
    light: {accent: "#6366F1", accent2: "#4F46E5", accentSoft: "#E0E7FF", gradient: "linear-gradient(135deg, #A5B4FC, #6366F1, #4F46E5, #4338CA)", hero: "linear-gradient(135deg, #E0E7FF, #C7D2FE, #A5B4FC, #C4B5FD)"},
    dark: {accent: "#A5B4FC", accent2: "#6366F1", accentSoft: "#1A1B3A", gradient: "linear-gradient(135deg, #A5B4FC, #6366F1, #4F46E5, #4338CA)", hero: "linear-gradient(135deg, #14142E, #1A1B3A, #16173A, #1B1736)"},
  },
  {
    id: "tangerine",
    light: {accent: "#F97316", accent2: "#EA580C", accentSoft: "#FFEDD5", gradient: "linear-gradient(135deg, #FDBA74, #F97316, #EA580C, #C2410C)", hero: "linear-gradient(135deg, #FFEDD5, #FED7AA, #FDBA74, #FCA5A5)"},
    dark: {accent: "#FDBA74", accent2: "#F97316", accentSoft: "#331A10", gradient: "linear-gradient(135deg, #FDBA74, #F97316, #EA580C, #C2410C)", hero: "linear-gradient(135deg, #2E1A0E, #331A10, #2A1A0E, #2E1414)"},
  },
  {
    id: "olive",
    light: {accent: "#84CC16", accent2: "#65A30D", accentSoft: "#ECFCCB", gradient: "linear-gradient(135deg, #BEF264, #84CC16, #65A30D, #4D7C0F)", hero: "linear-gradient(135deg, #ECFCCB, #D9F99D, #BEF264, #A7F3D0)"},
    dark: {accent: "#BEF264", accent2: "#84CC16", accentSoft: "#1E2E0C", gradient: "linear-gradient(135deg, #BEF264, #84CC16, #65A30D, #4D7C0F)", hero: "linear-gradient(135deg, #1A240C, #1E2E0C, #16240E, #10291A)"},
  },
  {
    id: "berry",
    light: {accent: "#BE185D", accent2: "#9D174D", accentSoft: "#FCE7F3", gradient: "linear-gradient(135deg, #F472B6, #BE185D, #9D174D, #831843)", hero: "linear-gradient(135deg, #FCE7F3, #FBCFE8, #F9A8D4, #FECDD3)"},
    dark: {accent: "#EC4899", accent2: "#BE185D", accentSoft: "#2E1226", gradient: "linear-gradient(135deg, #F472B6, #BE185D, #9D174D, #831843)", hero: "linear-gradient(135deg, #2E1226, #33122A, #2A1226, #2E1226)"},
  },
  {
    id: "navy",
    light: {accent: "#1E3A8A", accent2: "#1E40AF", accentSoft: "#DBEAFE", gradient: "linear-gradient(135deg, #60A5FA, #2563EB, #1E40AF, #1E3A8A)", hero: "linear-gradient(135deg, #DBEAFE, #BFDBFE, #93C5FD, #C7D2FE)"},
    dark: {accent: "#BFDBFE", accent2: "#2563EB", accentSoft: "#0F1F3D", gradient: "linear-gradient(135deg, #60A5FA, #2563EB, #1E40AF, #1E3A8A)", hero: "linear-gradient(135deg, #0B1526, #0F1F3D, #0C1A33, #101A2E)"},
  },
  {
    id: "wine",
    light: {accent: "#881337", accent2: "#9F1239", accentSoft: "#FFE4E6", gradient: "linear-gradient(135deg, #F43F5E, #881337, #9F1239, #4C0519)", hero: "linear-gradient(135deg, #FFE4E6, #FECDD3, #FDA4AF, #F9A8D4)"},
    dark: {accent: "#F9A8D4", accent2: "#881337", accentSoft: "#2E0E14", gradient: "linear-gradient(135deg, #F43F5E, #881337, #9F1239, #4C0519)", hero: "linear-gradient(135deg, #2E0E14, #331016, #2A0E18, #2E1218)"},
  },
  {
    id: "jade",
    light: {accent: "#047857", accent2: "#065F46", accentSoft: "#D1FAE5", gradient: "linear-gradient(135deg, #34D399, #047857, #065F46, #064E3B)", hero: "linear-gradient(135deg, #D1FAE5, #A7F3D0, #6EE7B7, #99F6E4)"},
    dark: {accent: "#6EE7B7", accent2: "#047857", accentSoft: "#0B2E26", gradient: "linear-gradient(135deg, #34D399, #047857, #065F46, #064E3B)", hero: "linear-gradient(135deg, #0B2622, #0B2E26, #0A2A24, #0C2B25)"},
  },
  {
    id: "aqua",
    light: {accent: "#06B6D4", accent2: "#0891B2", accentSoft: "#CFFAFE", gradient: "linear-gradient(135deg, #67E8F9, #06B6D4, #0891B2, #0E7490)", hero: "linear-gradient(135deg, #CFFAFE, #A5F3FC, #67E8F9, #BAE6FD)"},
    dark: {accent: "#67E8F9", accent2: "#06B6D4", accentSoft: "#0A2A30", gradient: "linear-gradient(135deg, #67E8F9, #06B6D4, #0891B2, #0E7490)", hero: "linear-gradient(135deg, #082A30, #0B2E33, #0A2A30, #0C2436)"},
  },
  {
    id: "magenta",
    light: {accent: "#D946EF", accent2: "#C026D3", accentSoft: "#FAE8FF", gradient: "linear-gradient(135deg, #F0ABFC, #D946EF, #C026D3, #A21CAF)", hero: "linear-gradient(135deg, #FAE8FF, #F5D0FE, #E9D5FF, #FBCFE8)"},
    dark: {accent: "#F0ABFC", accent2: "#D946EF", accentSoft: "#2E1233", gradient: "linear-gradient(135deg, #F0ABFC, #D946EF, #C026D3, #A21CAF)", hero: "linear-gradient(135deg, #26122E, #2E1233, #241230, #2A1230)"},
  },
  {
    id: "brick",
    light: {accent: "#B91C1C", accent2: "#991B1B", accentSoft: "#FEE2E2", gradient: "linear-gradient(135deg, #F87171, #B91C1C, #991B1B, #7F1D1D)", hero: "linear-gradient(135deg, #FEE2E2, #FECACA, #FDA4AF, #FCA5A5)"},
    dark: {accent: "#FDA4AF", accent2: "#B91C1C", accentSoft: "#2E0E0E", gradient: "linear-gradient(135deg, #F87171, #B91C1C, #991B1B, #7F1D1D)", hero: "linear-gradient(135deg, #2E0E0E, #331010, #2A0E0E, #2E1212)"},
  },
  {
    id: "bronze",
    light: {accent: "#92400E", accent2: "#78350F", accentSoft: "#FEF3C7", gradient: "linear-gradient(135deg, #FBBF24, #92400E, #78350F, #451A03)", hero: "linear-gradient(135deg, #FEF3C7, #FDE68A, #FCD34D, #FDBA74)"},
    dark: {accent: "#FDE68A", accent2: "#92400E", accentSoft: "#2E2110", gradient: "linear-gradient(135deg, #FBBF24, #92400E, #78350F, #451A03)", hero: "linear-gradient(135deg, #2E2110, #33230B, #2E2410, #2A1E10)"},
  },
  {
    id: "steel",
    light: {accent: "#334155", accent2: "#1E293B", accentSoft: "#F1F5F9", gradient: "linear-gradient(135deg, #94A3B8, #475569, #334155, #1E293B)", hero: "linear-gradient(135deg, #F1F5F9, #E2E8F0, #CBD5E1, #C7D2FE)"},
    dark: {accent: "#CBD5E1", accent2: "#64748B", accentSoft: "#1E293B", gradient: "linear-gradient(135deg, #94A3B8, #475569, #334155, #1E293B)", hero: "linear-gradient(135deg, #1A2433, #1E293B, #1B2536, #1C2331)"},
  },
  {
    id: "blush",
    light: {accent: "#F472B6", accent2: "#EC4899", accentSoft: "#FCE7F3", gradient: "linear-gradient(135deg, #FBCFE8, #F472B6, #EC4899, #DB2777)", hero: "linear-gradient(135deg, #FCE7F3, #FBCFE8, #F9A8D4, #F5D0FE)"},
    dark: {accent: "#FBCFE8", accent2: "#F472B6", accentSoft: "#33122A", gradient: "linear-gradient(135deg, #FBCFE8, #F472B6, #EC4899, #DB2777)", hero: "linear-gradient(135deg, #2E1226, #33122A, #2A1226, #2E1226)"},
  },
  {
    id: "moss",
    light: {accent: "#3F6212", accent2: "#365314", accentSoft: "#ECFCCB", gradient: "linear-gradient(135deg, #A3E635, #65A30D, #3F6212, #365314)", hero: "linear-gradient(135deg, #ECFCCB, #D9F99D, #BEF264, #A7F3D0)"},
    dark: {accent: "#D9F99D", accent2: "#65A30D", accentSoft: "#1E2E0C", gradient: "linear-gradient(135deg, #A3E635, #65A30D, #3F6212, #365314)", hero: "linear-gradient(135deg, #1A240C, #1E2E0C, #16240E, #10291A)"},
  },
  {
    id: "apricot",
    light: {accent: "#FB923C", accent2: "#F97316", accentSoft: "#FFEDD5", gradient: "linear-gradient(135deg, #FED7AA, #FB923C, #F97316, #EA580C)", hero: "linear-gradient(135deg, #FFEDD5, #FED7AA, #FDBA74, #FCA5A5)"},
    dark: {accent: "#FED7AA", accent2: "#FB923C", accentSoft: "#331A10", gradient: "linear-gradient(135deg, #FED7AA, #FB923C, #F97316, #EA580C)", hero: "linear-gradient(135deg, #2E1A0E, #331A10, #2A1A0E, #2E1414)"},
  },
  {
    id: "cobalt",
    light: {accent: "#1E40AF", accent2: "#1D4ED8", accentSoft: "#DBEAFE", gradient: "linear-gradient(135deg, #60A5FA, #2563EB, #1E40AF, #1E3A8A)", hero: "linear-gradient(135deg, #DBEAFE, #BFDBFE, #93C5FD, #C7D2FE)"},
    dark: {accent: "#93C5FD", accent2: "#1E40AF", accentSoft: "#0F1F3D", gradient: "linear-gradient(135deg, #60A5FA, #2563EB, #1E40AF, #1E3A8A)", hero: "linear-gradient(135deg, #0B1526, #0F1F3D, #0C1A33, #101A2E)"},
  },
];

/** Valid preset ids, derived from THEME_PRESETS (single source of truth)
 * plus "custom". A separate hand-written list drifted before: it had
 * only the first 10 presets, so a stored new preset was dropped by
 * sanitizeTheme and never applied after a reload. */
export const THEME_PRESET_IDS = [...THEME_PRESETS.map((p) => p.id), "custom"];

/** Apply one preset's brand variables to <html> as INLINE styles.
 * v3.0.5: this is now the single source of truth for named presets.
 * Before, named presets relied on [data-preset] rules in index.css,
 * which existed for only 4 of the 10 old presets (rose/teal/amber/
 * lime/ruby silently kept the default accent) and for none of the 10
 * new ones; those dead rules were removed from index.css.
 * --bg/--surface are NOT set for named presets: they come from the
 * [data-theme] rules in index.css. Switching away from "custom"
 * removes the inline --bg/--surface the custom preset had set.
 * `resolvedMode` is "light" | "dark" (never "auto"). */
function applyPresetVars(root, presetId, resolvedMode, customVals) {
  if (presetId === "custom") {
    root.style.setProperty("--accent", customVals.accent);
    root.style.setProperty("--accent-2", customVals.accent2);
    root.style.setProperty("--accent-gradient", `linear-gradient(135deg, ${customVals.accent}, ${customVals.accent2})`);
    root.style.setProperty("--accent-soft", `color-mix(in srgb, ${customVals.accent} 14%, ${customVals.surface})`);
    root.style.setProperty("--hero-gradient", `linear-gradient(135deg, ${customVals.accent}, ${customVals.accent2})`);
    root.style.setProperty("--bg", customVals.bg);
    root.style.setProperty("--surface", customVals.surface);
    return;
  }
  const p = THEME_PRESETS.find((x) => x.id === presetId);
  const v = p ? p[resolvedMode] : null;
  if (v) {
    root.style.setProperty("--accent", v.accent);
    root.style.setProperty("--accent-2", v.accent2);
    root.style.setProperty("--accent-gradient", v.gradient);
    root.style.setProperty("--accent-soft", v.accentSoft);
    root.style.setProperty("--hero-gradient", v.hero);
  } else {
    // Unknown preset (e.g. a stale stored id): fall back to the :root
    // defaults by removing the inline overrides.
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-2");
    root.style.removeProperty("--accent-gradient");
    root.style.removeProperty("--accent-soft");
    root.style.removeProperty("--hero-gradient");
  }
  root.style.removeProperty("--bg");
  root.style.removeProperty("--surface");
}

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
    applyPresetVars(root, preset, r, custom);
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
        // v3.0.5: preset colours are inline styles now, so an OS theme
        // change must re-apply the current preset's variant for the new
        // resolved mode (the old [data-preset] CSS rules did this
        // automatically; inline styles do not).
        applyPresetVars(root, preset, r, custom);
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, [mode, preset, custom]);

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
