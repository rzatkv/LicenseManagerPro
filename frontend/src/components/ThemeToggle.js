import React from "react";
import {useLanguage} from "../i18n";
import {useTheme} from "../theme";
import "./ThemeToggle.css";

/** Animated light/dark/auto toggle (v2.3). One click cycles the mode;
 * the sun/moon icons cross-fade and rotate, and the whole app theme
 * cross-fades via the .theme-animating class (see theme.js). */
function ThemeToggle() {
  const {t} = useLanguage();
  const {mode, resolved, cycle} = useTheme();
  const label = mode === "auto" ? t("theme.auto") : mode === "dark" ? t("theme.dark") : t("theme.light");
  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${resolved}`}
      onClick={cycle}
      title={`${t("theme.toggle")}: ${label}`}
      aria-label={`${t("theme.toggle")}: ${label}`}
    >
      <span className="theme-toggle-track">
        <svg className="theme-toggle-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg className="theme-toggle-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z" />
        </svg>
      </span>
      {mode === "auto" && <span className="theme-toggle-auto">A</span>}
    </button>
  );
}

export default ThemeToggle;
