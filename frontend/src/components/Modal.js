import React, {useEffect} from "react";
import {useLanguage} from "../i18n";
import "./Modal.css";

/**
 * Animated details popup (v2.2.2): the split-not-squeeze way to show
 * the columns that don't fit a narrow table — the rest of the record
 * lives here, breathing, instead of being crammed into the table.
 * Closes via the × button, a tap/click on the backdrop, or Escape.
 * The card is fully opaque (solid surface): page content must never
 * bleed through a popup.
 */
function Modal({title, onClose, children}) {
    const {t} = useLanguage();

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
            <div className="modal-card modal-card-details" onClick={(e) => e.stopPropagation()}>
                <div className="modal-details-head">
                    <h2>{title}</h2>
                    <button type="button" className="modal-close" aria-label={t("common.close")} onClick={onClose}>
                        ×
                    </button>
                </div>
                <div className="modal-details-body">{children}</div>
            </div>
        </div>
    );
}

export default Modal;
