import React, {createContext, useContext, useState, useEffect, useCallback} from "react";
import {BUILTIN} from "./translations";

const LanguageContext = createContext(null);
const LANG_KEY = "lmp-lang";

function initialLang() {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored) return stored;
    const nav = (navigator.language || "en").slice(0, 2).toLowerCase();
    return nav === "fa" || nav === "en" ? nav : "en";
  } catch (e) {
    return "en";
  }
}

// Custom dictionaries fetched from the API (GET /api/languages), merged
// over the built-ins. Missing keys always fall back to English.
export function LanguageProvider({children}) {
  const [lang, setLangState] = useState(initialLang);
  const [custom, setCustom] = useState({}); // {code: {key: value}}
  const [available, setAvailable] = useState([
    {code: "en", name: "English"},
    {code: "fa", name: "فارسی"},
  ]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch (e) {}
  }, [lang]);

  const setLang = useCallback((code) => setLangState(code), []);

  const fetchLanguages = useCallback(async () => {
    try {
      const {get} = await import("../utils/api");
      const list = await get("/languages");
      if (Array.isArray(list) && list.length) {
        setAvailable(list);
        const merged = {};
        for (const entry of list) {
          if (entry.code === "en" || entry.code === "fa") continue;
          try {
            const full = await get(`/languages/${entry.code}`);
            if (full && full.translations) merged[entry.code] = full.translations;
          } catch (e) {
            // One broken custom language must not break the rest.
          }
        }
        setCustom(merged);
      }
    } catch (e) {
      // Offline / old backend without /languages: keep built-ins only.
    }
  }, []);

  // Load the language list once, here in the provider — not only in
  // Layout (v2.3.3): the login page uses the same LanguageMenu as the
  // header, but Layout mounts only AFTER login, so a fresh login page
  // showed just the two built-ins while the header showed the custom
  // languages too (e.g. the seeded "Deutsch (sample)"). Same
  // component, same options, on both sides of login now. The fetch is
  // best-effort: on a real backend without auth it fails quietly and
  // the built-ins stay.
  useEffect(() => { fetchLanguages(); }, [fetchLanguages]);

  const t = useCallback(
    (key) => {
      const dict = BUILTIN[lang] || BUILTIN.en;
      if (dict && dict[key] !== undefined) return dict[key];
      if (custom[lang] && custom[lang][key] !== undefined) return custom[lang][key];
      if (BUILTIN.en[key] !== undefined) return BUILTIN.en[key];
      return key;
    },
    [lang, custom]
  );

  return (
    <LanguageContext.Provider value={{lang, setLang, t, available, fetchLanguages, custom, setCustom, setAvailable}}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used inside LanguageProvider");
  return ctx;
}
