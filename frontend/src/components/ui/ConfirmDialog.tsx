import { CircleAlert } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** A question or statement: "Cancel order #1045?" */
  title: ReactNode;
  /** What will happen: "The order's due amount goes back up." */
  description?: ReactNode;
  /** Says exactly what happens: "Void payment", "Cancel order". */
  confirmLabel: string;
  /** Default "Keep it" — never ambiguous next to a "Cancel order" button. */
  cancelLabel?: string;
  /** "danger" (default) or "primary". */
  tone?: "danger" | "primary";
  /** Disables both buttons and shows a spinner on confirm. */
  loading?: boolean;
  /** Shown inside the dialog, e.g. the API's 409 message. */
  error?: ReactNode;
  children?: ReactNode;
}

/** A small confirmation modal. Focus starts on the safe choice. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep it",
  tone = "danger",
  loading = false,
  error,
  children,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hasError = error !== undefined && error !== null && error !== false && error !== "";
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      size="sm"
      title={title}
      description={description}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children || hasError ? (
        <>
          {children}
          {hasError && (
            <p className={styles.error} role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{error}</span>
            </p>
          )}
        </>
      ) : null}
    </Modal>
  );
}
