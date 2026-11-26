import React, {useState, useEffect, useRef} from "react";
import {createPortal} from "react-dom";
import {ChevronDown, Check} from "lucide-react";

/** Dropdown replacement for a secondary tab strip (v3.0.4): shows the
 * current selection, opens to the full option list, switches content on
 * selection. A full-width button at full height — the old .mini-tabs
 * row was crushed to a ~10px sliver by flex-shrink in v3.0.2, which
 * must never return. Tappable on phones, keyboard accessible (arrows
 * move focus, Enter/Space selects, Escape closes, click-outside
 * closes). The option list is portaled to document.body so it is never
 * clipped by a scrolling section ancestor.
 * options: [{value, label, icon?}]. */
export default function TabDropdown({options, value, onChange, ariaLabel}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const listRef = useRef(null);
  const current = options.find((o) => o.value === value) || options[0];

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current ? btnRef.current.getBoundingClientRect() : null;
    if (!r) return;
    setPos({
      top: r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight: Math.max(160, Math.min(320, window.innerHeight - r.bottom - 16)),
    });
    setOpen(true);
  };

  // Close on outside tap, Escape, scroll or resize (position is fixed).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const inBtn = btnRef.current && btnRef.current.contains(e.target);
      const inList = listRef.current && listRef.current.contains(e.target);
      if (!inBtn && !inList) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  // Focus the selected option when the list opens.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const active = listRef.current.querySelector(".tab-dropdown-option.active");
    if (active) active.focus();
  }, [open]);

  const onBtnKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) toggle(); }
  };
  const onListKey = (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const btns = listRef.current ? [...listRef.current.querySelectorAll("button")] : [];
    if (btns.length === 0) return;
    const i = btns.indexOf(document.activeElement);
    const n = e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
    btns[n].focus();
  };

  return (
    <div className="tab-dropdown">
      <button
        type="button"
        ref={btnRef}
        className="tab-dropdown-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        onKeyDown={onBtnKey}
      >
        <span className="tab-dropdown-current">
          {current && current.icon}
          <span>{current ? current.label : ""}</span>
        </span>
        <ChevronDown size={16} className={`tab-dropdown-chevron${open ? " open" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div
          className="tab-dropdown-list"
          role="listbox"
          aria-label={ariaLabel}
          ref={listRef}
          onKeyDown={onListKey}
          style={{top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight}}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`tab-dropdown-option${o.value === value ? " active" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.icon}
              <span>{o.label}</span>
              {o.value === value && <Check size={14} className="tab-dropdown-check" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
