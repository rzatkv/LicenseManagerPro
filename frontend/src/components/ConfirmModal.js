import React from "react";
import {useLanguage} from "../i18n";

/** Styled confirm dialog (replaces window.confirm). */
export default function ConfirmModal({open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true}) {
  const {t} = useLanguage();
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
