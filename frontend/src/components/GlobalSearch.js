import React, {useState, useEffect, useRef, useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {useLanguage} from "../i18n";
import {get} from "../utils/api";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";
import {useDismissOnOutsideOrEscape} from "../utils/useDismiss";
import "./GlobalSearch.css";

/** Global search in the header (v2.3): searches licenses (key/customer),
 * products and users in one call. Dropdown results, click navigates,
 * keyboard navigable (↑/↓ + Enter + Esc). */
function GlobalSearch() {
  const {t} = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const showDropdown = open && query.trim().length >= 2;
  const {visible: dropdownVisible, closing: dropdownClosing} = useAnimatedOpen(showDropdown);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({licenses: [], products: [], users: []});
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const timerRef = useRef(null);

  const flat = [
    ...results.licenses.map((r) => ({...r, group: "licenses"})),
    ...results.products.map((r) => ({...r, group: "products"})),
    ...results.users.map((r) => ({...r, group: "users"})),
  ];

  const runSearch = useCallback((q) => {
    if (!q || q.trim().length < 2) {
      setResults({licenses: [], products: [], users: []});
      setLoading(false);
      return;
    }
    setLoading(true);
    get(`/search?q=${encodeURIComponent(q.trim())}`)
      .then((data) => {
        setResults({
          licenses: data.licenses || [],
          products: data.products || [],
          users: data.users || [],
        });
        setActive(0);
      })
      .catch(() => setResults({licenses: [], products: [], users: []}))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 2) {
      setResults({licenses: [], products: [], users: []});
      setLoading(false);
      return undefined;
    }
    timerRef.current = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(timerRef.current);
  }, [query, runSearch]);

  // Close on outside click / Escape (v3.0.6 shared hook; Escape used to
  // work only from the input's own keydown).
  useDismissOnOutsideOrEscape(rootRef, () => setOpen(false));

  const go = (item) => {
    setOpen(false);
    setQuery("");
    navigate(item.link);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (flat.length ? Math.min(a + 1, flat.length - 1) : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat.length && flat[active]) {
      e.preventDefault();
      go(flat[active]);
    }
  };

  const groupLabel = (g) => t(`search.${g}`);
  const groupIcon = (g) =>
    g === "licenses" ? "🔑" : g === "products" ? "📦" : "👤";

  return (
    <div className="global-search" ref={rootRef}>
      <div className="global-search-box">
        <span className="global-search-icon" aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          placeholder={t("search.placeholder")}
          aria-label={t("search.placeholder")}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {loading && <span className="global-search-spinner" aria-hidden="true" />}
        {query && (
          <button
            type="button"
            className="global-search-clear"
            aria-label={t("common.clear")}
            onClick={() => { setQuery(""); setResults({licenses: [], products: [], users: []}); }}
          >×</button>
        )}
      </div>
      {dropdownVisible && (
        <div className={`global-search-dropdown${dropdownClosing ? " dropdown-closing" : ""}`} role="listbox">
          {flat.length === 0 && !loading && (
            <div className="global-search-empty">{t("search.noResults")}</div>
          )}
          {["licenses", "products", "users"].map((g) => (
            results[g] && results[g].length > 0 ? (
              <div key={g} className="global-search-group">
                <div className="global-search-group-label">{groupLabel(g)}</div>
                {results[g].map((item) => {
                  const idx = flat.findIndex((f) => f.type === item.type && f.id === item.id);
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={idx === active}
                      className={`global-search-item${idx === active ? " active" : ""}`}
                      onMouseEnter={() => setActive(idx)}
                      onClick={() => go(item)}
                    >
                      <span className="global-search-item-icon" aria-hidden="true">{groupIcon(g)}</span>
                      <span className="global-search-item-text">
                        <span className="global-search-item-title">{item.title}</span>
                        {item.subtitle && <span className="global-search-item-sub">{item.subtitle}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null
          ))}
        </div>
      )}
    </div>
  );
}

export default GlobalSearch;
