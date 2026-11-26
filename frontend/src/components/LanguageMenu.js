import React, {useState, useEffect, useRef} from "react";
import {Globe} from "lucide-react";
import {useLanguage} from "../i18n";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";
import "./LanguageMenu.css";

/** Header language menu (v2.3.2): ONE component used in both places —
 * the app header topbar (Layout.js) and the login page
 * (.login-top-controls). A globe icon button opening a dropdown of the
 * available languages, with a ✓ on the active one — the same
 * icon-button + dropdown language as the header's other controls.
 *
 * It replaces the native <select> pair that used to sit on the login
 * page: the selects looked nothing like the header controls, and their
 * two wide pills overlapped the hero logo's key icon on short phone
 * viewports (measured live-DOM at 400x800, fa dark). The icon buttons
 * are ~40px each, so the overlap is gone by construction. */
function LanguageMenu() {
  const {t, lang, setLang, available} = useLanguage();
  const [open, setOpen] = useState(false);
  const {visible: menuVisible, closing: menuClosing} = useAnimatedOpen(open);
  const rootRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="language-menu" ref={rootRef}>
      <button
        type="button"
        className="language-menu-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("common.language")}
        title={t("common.language")}
      >
        <Globe size={18} aria-hidden="true" />
      </button>
      {menuVisible && (
        <div className={`language-menu-dropdown${menuClosing ? " dropdown-closing" : ""}`} role="menu">
          {available.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={lang === l.code}
              className={lang === l.code ? "active" : ""}
              onClick={() => { setLang(l.code); setOpen(false); }}
            >
              <span className="language-menu-name">{l.name}</span>
              <span className="language-menu-check" aria-hidden="true">{lang === l.code ? "✓" : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default LanguageMenu;
