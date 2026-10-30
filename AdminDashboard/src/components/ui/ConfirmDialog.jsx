import { useEffect, useState } from "react";
import { t } from "../../lib/i18n";
import Button from "./Button";
import Input from "./Input";
import Modal from "./Modal";

export default function ConfirmDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  // When set, the confirm button stays disabled until the user types this
  // exact string. Used for irreversible actions (tenant delete/archive) as a
  // speed bump against double-click and auto-pilot destructive clicks.
  requireTyped = null,
  language = "en",
}) {
  const [typed, setTyped] = useState("");

  // Fresh dialog => fresh input, otherwise a stale typed value would leave
  // the confirm button enabled instantly for the next destructive action.
  useEffect(() => {
    setTyped("");
  }, [isOpen, requireTyped]);

  const confirmed = !requireTyped || typed.trim() === String(requireTyped);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {message && (
        <p className="text-slate-600 dark:text-slate-300 mb-6">{message}</p>
      )}
      {requireTyped && (
        <div className="mb-6">
          <Input
            label={t("typeToConfirm", { confirmWord: requireTyped }, language)}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck="false"
            disabled={loading}
          />
        </div>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} loading={loading} disabled={!confirmed}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
