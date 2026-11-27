import React from "react";
import {AlertTriangle} from "lucide-react";
import {useLanguage} from "../i18n";
import Modal from "./Modal";

/** Styled confirm dialog (replaces window.confirm). v3.0: animated close
 * (stays mounted ~200ms while the exit animation plays). v3.0.1: portaled
 * to document.body like Modal — a fixed backdrop inside a glass/scroll
 * ancestor can be pushed off-viewport on phones (see Modal.js).
 * v3.0.6: implemented on top of Modal (plain variant, role="alertdialog")
 * instead of a second copy of the portal/backdrop/animation shell — so
 * confirms now also close on Escape, like every Modal. Visuals unchanged:
 * plain card, icon title, Cancel + danger Confirm buttons, no ×. */
export default function ConfirmModal({open, title, message, confirmLabel, cancelLabel, onConfirm, onCancel, danger = true}) {
  const {t} = useLanguage();
  return (
    <Modal open={open} plain role="alertdialog" onClose={onCancel}
      title={<>{danger && <AlertTriangle size={20} />}{title || t("common.confirm")}</>}>
      <p>{message || t("common.confirmDelete")}</p>
      <div className="modal-actions">
        <button className="btn-ghost" onClick={onCancel}>{cancelLabel || t("common.cancel")}</button>
        <button className={danger ? "btn-danger" : ""} onClick={onConfirm}>{confirmLabel || t("common.delete")}</button>
      </div>
    </Modal>
  );
}
