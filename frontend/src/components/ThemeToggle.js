import React from "react";
import {motion, useReducedMotion} from "framer-motion";
import {Sun, Moon} from "lucide-react";
import {useLanguage} from "../i18n";
import {useTheme} from "../theme";
import "./ThemeToggle.css";

/** Animated light/dark/auto toggle (v2.3). One click cycles the mode;
 * the sun/moon icons cross-fade and rotate, and the whole app theme
 * cross-fades via the .theme-animating class (see theme.js). v3.0.4:
 * the icon also spins once per mode change (framer-motion), off when
 * the user prefers reduced motion. */
function ThemeToggle() {
  const {t} = useLanguage();
  const {mode, resolved, cycle} = useTheme();
  const reduceMotion = useReducedMotion();
  const label = mode === "auto" ? t("theme.auto") : mode === "dark" ? t("theme.dark") : t("theme.light");
  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${resolved}`}
      onClick={cycle}
      title={`${t("theme.toggle")}: ${label}`}
      aria-label={`${t("theme.toggle")}: ${label}`}
    >
      <motion.span
        className="theme-toggle-track"
        key={resolved}
        initial={reduceMotion ? false : {rotate: -120, opacity: 0}}
        animate={{rotate: 0, opacity: 1}}
        transition={{duration: 0.4, ease: "easeOut"}}
      >
        <Sun className="theme-toggle-sun" size={18} />
        <Moon className="theme-toggle-moon" size={18} />
      </motion.span>
      {mode === "auto" && <span className="theme-toggle-auto">A</span>}
    </button>
  );
}

export default ThemeToggle;
