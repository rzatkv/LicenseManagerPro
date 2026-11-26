import React, {useEffect} from "react";
import {createPortal} from "react-dom";
import {useLanguage} from "../i18n";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";
import "./Modal.css";

/**
 * Animated details popup (v2.2.2, animated close in v3.0): the
 * split-not-squeeze way to show the columns that don't fit a narrow
 * table — the rest of the record lives here, breathing, instead of
 * being crammed into the table.
 * Closes via the × button, a tap/click on the backdrop, or Escape.
 * The card is fully opaque (solid surface): page content must never
 * bleed through a popup.
 * `open` controls visibility; the exit animation plays before unmount
 * (useAnimatedOpen), so parents render <Modal open={...}> unconditionally.
 * v3.0.1: rendered through a portal into document.body — a `position:
 * fixed` backdrop inside a page is anchored to the nearest ancestor
 * with a transform / backdrop-filter / filter (e.g. the glass Settings
 * sections, the scrollable Settings tabpanel), which put the Languages
 * editor's title + × above the viewport on phones with no way to close
 * it (no Escape key on a phone). Portaled, the backdrop is always
 * viewport-anchored and the × is always reachable.
 */
function Modal({open = true, title, onClose, children, wide = false}) {
    const {t} = useLanguage();
    const {visible, closing} = useAnimatedOpen(open);

    useEffect(() => {
        if (!visible) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [visible, onClose]);

    if (!visible) return null;
    return createPortal(
        <div className={`modal-backdrop${closing ? " modal-closing" : ""}`} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
            <div className={`modal-card modal-card-details${wide ? " modal-card-wide" : ""}${closing ? " modal-card-closing" : ""}`} onClick={(e) => e.stopPropagation()}>
                <div className="modal-details-head">
                    <h2>{title}</h2>
                    <button type="button" className="modal-close" aria-label={t("common.close")} onClick={onClose}>
                        ×
                    </button>
                </div>
                <div className="modal-details-body">{children}</div>
            </div>
        </div>,
        document.body
    );
}

export default Modal;
