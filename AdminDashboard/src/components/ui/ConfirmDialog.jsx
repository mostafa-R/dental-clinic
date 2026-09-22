import Button from "./Button";
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
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      {message && (
        <p className="text-slate-600 dark:text-slate-300 mb-6">{message}</p>
      )}
      <div className="flex justify-end gap-3">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={variant} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}