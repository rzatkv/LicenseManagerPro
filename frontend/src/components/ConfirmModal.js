import React from "react";
import {useLanguage} from "../i18n";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";

/** Styled confirm dialog (replaces window.confirm). v3.0: animated close
 * (stays mounted ~200ms while the exit animation plays). */
export default function ConfirmModal({open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true}) {
  const {t} = useLanguage();
  const {visible, closing} = useAnimatedOpen(open);
  if (!visible) return null;
  return (
    <div className={`modal-backdrop${closing ? " modal-closing" : ""}`} onClick={onCancel}>
      <div className={`modal-card${closing ? " modal-card-closing" : ""}`} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{title || t("common.confirm")}</h2>
        <p>{message || t("common.confirmDelete")}</p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel || t("common.cancel")}</button>
          <button className={danger ? "btn-danger" : ""} onClick={onConfirm}>{confirmLabel || t("common.delete")}</button>
        </div>
      </div>
    </div>
  );
}
