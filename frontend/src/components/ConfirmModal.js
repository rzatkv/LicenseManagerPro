import React from "react";
import {createPortal} from "react-dom";
import {AlertTriangle} from "lucide-react";
import {useLanguage} from "../i18n";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";

/** Styled confirm dialog (replaces window.confirm). v3.0: animated close
 * (stays mounted ~200ms while the exit animation plays). v3.0.1: portaled
 * to document.body like Modal — a fixed backdrop inside a glass/scroll
 * ancestor can be pushed off-viewport on phones (see Modal.js). */
export default function ConfirmModal({open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true}) {
  const {t} = useLanguage();
  const {visible, closing} = useAnimatedOpen(open);
  if (!visible) return null;
  return createPortal(
    <div className={`modal-backdrop${closing ? " modal-closing" : ""}`} onClick={onCancel}>
      <div className={`modal-card${closing ? " modal-card-closing" : ""}`} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2 className="confirm-modal-title">{danger && <AlertTriangle size={20} />}{title || t("common.confirm")}</h2>
        <p>{message || t("common.confirmDelete")}</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel || t("common.cancel")}</button>
          <button className={danger ? "btn-danger" : ""} onClick={onConfirm}>{confirmLabel || t("common.delete")}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
