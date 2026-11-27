import React from "react";
import {createPortal} from "react-dom";
import {useLanguage} from "../i18n";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";
import {anyDropdownOpen, useDismissOnOutsideOrEscape} from "../utils/useDismiss";
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
 * `plain` (v3.0.6): the confirm-dialog variant — plain `.modal-card`
 * (no details head, no ×), role="alertdialog" via `role`. ConfirmModal
 * is implemented on top of this, so confirms get Escape for free.
 * v3.0.1: rendered through a portal into document.body — a `position:
 * fixed` backdrop inside a page is anchored to the nearest ancestor
 * with a transform / backdrop-filter / filter (e.g. the glass Settings
 * sections, the scrollable Settings tabpanel), which put the Languages
 * editor's title + × above the viewport on phones with no way to close
 * it (no Escape key on a phone). Portaled, the backdrop is always
 * viewport-anchored and the × is always reachable.
 */
function Modal({open = true, title, onClose, children, wide = false, role = "dialog", plain = false}) {
    const {t} = useLanguage();
    const {visible, closing} = useAnimatedOpen(open);

    // Escape closes the modal (v3.0.6 shared hook, outsideClick off —
    // the backdrop's own handler handles outside clicks). An open
    // dropdown owns this Escape — topmost layer wins. The Languages
    // editor is a Modal hosting a TabDropdown: without this guard,
    // Escape closed the dropdown AND the editor underneath it,
    // discarding unsaved edits (and detaching the dropdown button
    // mid-audit). When no dropdown is open, Escape closes the modal.
    useDismissOnOutsideOrEscape([], () => {
        if (anyDropdownOpen()) return;
        onClose();
    }, {enabled: visible, outsideClick: false});

    // Backdrop dismiss (v3.0.6): onMouseDown, not onClick — the
    // dropdowns dismiss on the document mousedown, which fires AFTER
    // this handler in the bubble path, so at mousedown time an open
    // dropdown is still in the DOM and the guard can see it. (With
    // onClick the dropdown was already unmounted by the time the click
    // arrived, so the guard could never fire and a backdrop click
    // closed the dropdown AND the modal underneath it — the same
    // double-dismiss as the Escape bug, found by the probe in the
    // Languages editor.) The press dismisses the dropdown only; the
    // next backdrop press closes the modal.
    const onBackdropMouseDown = () => {
        if (anyDropdownOpen()) return;
        onClose();
    };

    if (!visible) return null;
    return createPortal(
        <div className={`modal-backdrop${closing ? " modal-closing" : ""}`} role={role} aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onMouseDown={onBackdropMouseDown}>
            <div className={`modal-card${plain ? "" : " modal-card-details"}${!plain && wide ? " modal-card-wide" : ""}${closing ? " modal-card-closing" : ""}`} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                {plain ? (
                    <>
                        <h2 className="confirm-modal-title">{title}</h2>
                        {children}
                    </>
                ) : (
                    <>
                        <div className="modal-details-head">
                            <h2>{title}</h2>
                            <button type="button" className="modal-close" aria-label={t("common.close")} onClick={onClose}>
                                ×
                            </button>
                        </div>
                        <div className="modal-details-body">{children}</div>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
}

export default Modal;
