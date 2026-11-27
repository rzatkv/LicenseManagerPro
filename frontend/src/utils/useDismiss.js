import {useEffect, useRef} from "react";

/**
 * Shared outside-click + Escape dismiss behaviour (v3.0.6 — merges the
 * copies that lived in TabDropdown, ProfileMenu, LanguageMenu,
 * NotificationsBell, GlobalSearch, Modal and the Layout drawer).
 *
 * `refs`: one ref, or an array of refs, whose elements count as "inside"
 *   — a mousedown inside any of them does NOT dismiss. Portaled panels
 *   need their own ref here: the bell panel and the TabDropdown option
 *   list live outside their trigger's subtree, so the trigger ref alone
 *   would dismiss on every click inside the panel.
 * `onClose`: called to dismiss.
 * Options:
 *   `enabled` (default true): listeners only while true — the old
 *     ProfileMenu/LanguageMenu copies listened even while closed.
 *   `outsideClick` (default true): dismiss on mousedown outside the
 *     refs. False for Escape-only users (Modal, Layout drawer — the
 *     modal's backdrop click already handles outside clicks).
 *   `closeOnScroll` (default false): also dismiss on window scroll /
 *     resize — only for fixed-position panels (TabDropdown).
 *   `scrollInsideRefs` (default []): refs whose own scrolls must NOT
 *     dismiss — the TabDropdown option list is scrollable by design
 *     (v3.0.6 fix: scrolling it to reach a lower option used to close
 *     the list, so the option could never be picked).
 *
 * `refs`/`onClose` are mirrored into a ref, so callers may pass inline
 * arrays and closures without re-subscribing on every render.
 */
/**
 * Is any floating layer that sits ABOVE a modal currently open?
 * (Portaled dropdown lists, menus, the bell panel, global search.)
 * A modal must not also close on the same gesture that dismisses one
 * of these — topmost layer wins (v3.0.6, Languages editor: a backdrop
 * click while the section dropdown was open closed the dropdown AND
 * the editor underneath it, discarding unsaved edits).
 */
export function anyDropdownOpen() {
  return !!document.querySelector(
    ".tab-dropdown-list, .language-menu-dropdown, .profile-menu-dropdown, .notif-panel, .global-search-dropdown"
  );
}

export function useDismissOnOutsideOrEscape(refs, onClose, options = {}) {
  const {enabled = true, outsideClick = true, closeOnScroll = false, scrollInsideRefs = []} = options;
  const latest = useRef({refs, onClose, scrollInsideRefs});
  latest.current = {refs, onClose, scrollInsideRefs};

  useEffect(() => {
    if (!enabled) return;
    const inside = (target) => {
      const rs = Array.isArray(latest.current.refs) ? latest.current.refs : [latest.current.refs];
      return rs.some((r) => r && r.current && r.current.contains(target));
    };
    const insideScroll = (target) =>
      latest.current.scrollInsideRefs.some((r) => r && r.current && r.current.contains(target));
    const onDoc = (e) => {
      if (!inside(e.target)) latest.current.onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") latest.current.onClose();
    };
    const onMove = (e) => {
      if (e && e.target && insideScroll(e.target)) return;
      latest.current.onClose();
    };
    if (outsideClick) document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    if (closeOnScroll) {
      window.addEventListener("scroll", onMove, true);
      window.addEventListener("resize", onMove);
    }
    return () => {
      if (outsideClick) document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      if (closeOnScroll) {
        window.removeEventListener("scroll", onMove, true);
        window.removeEventListener("resize", onMove);
      }
    };
  }, [enabled, outsideClick, closeOnScroll]);
}
