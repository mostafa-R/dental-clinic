import { useEffect, useId, useRef } from "react";
import { useSelector } from "react-redux";
import { XMarkIcon } from "./icons";
import { t } from "../../lib/i18n";

const SIZES = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function getFocusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.disabled && el.offsetParent !== null,
  );
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  labelledBy,
}) {
  const titleId = useId();
  const { language } = useSelector((state) => state.ui);
  const dialogRef = useRef(null);
  const openTriggerRef = useRef(null);
  const prevOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Remember opener, focus the first focusable element, restore focus on close
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      prevOpenRef.current = true;
      openTriggerRef.current = document.activeElement;
      const focusables = getFocusableElements(dialogRef.current);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else if (dialogRef.current) {
        dialogRef.current.focus();
      }
    } else if (!isOpen && prevOpenRef.current) {
      prevOpenRef.current = false;
      if (
        openTriggerRef.current &&
        typeof openTriggerRef.current.focus === "function"
      ) {
        openTriggerRef.current.focus();
      }
      openTriggerRef.current = null;
    }
  }, [isOpen]);

  // Escape to close + Tab focus trap while the dialog is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = getFocusableElements(dialogRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const labelId = labelledBy || (title ? titleId : undefined);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Dialog */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          tabIndex={-1}
          className={`relative w-full ${SIZES[size]} bg-white dark:bg-slate-800 rounded-xl shadow-xl transform transition-all outline-none`}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {title ? (
              <h3
                id={titleId}
                className="text-lg font-semibold text-slate-900 dark:text-white"
              >
                {title}
              </h3>
            ) : (
              <span />
            )}
            <button
              onClick={onClose}
              aria-label={t("close", language)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}