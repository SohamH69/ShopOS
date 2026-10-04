import { X } from "lucide-react";
import { useId, useRef, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { cx } from "../../lib/cx";
import { IconButton } from "./Button";
import styles from "./Modal.module.css";
import { usePresence, useOverlayLayer } from "./overlay";
import { Portal } from "./Portal";
import { cleanId } from "./utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, right-aligned (stacked full-width on phones, last button on top). */
  footer?: ReactNode;
  /** sm 400px · md 520px (default) · lg 720px. */
  size?: "sm" | "md" | "lg";
  /** "center" (default; a bottom sheet on phones) or "bottom" (a bottom sheet everywhere). */
  placement?: "center" | "bottom";
  /** Element to focus on open; otherwise an autoFocus field, [data-autofocus], or the dialog itself. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Close when the dimmed backdrop is clicked. Default true. */
  closeOnBackdrop?: boolean;
  hideClose?: boolean;
  /** Wraps body and footer in a <form noValidate>: put a type="submit" Button in the footer. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}

/** Dialog in a portal: focus trapped, Esc closes, focus returns to the opener, page scroll locked. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  placement = "center",
  initialFocusRef,
  closeOnBackdrop = true,
  hideClose = false,
  onSubmit,
  className,
}: ModalProps) {
  const { mounted, closing } = usePresence(open, 180);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropPressed = useRef(false);
  const id = cleanId(useId());
  const titleId = `modal-${id}-title`;
  const descriptionId = `modal-${id}-description`;

  useOverlayLayer({ open, onClose, panelRef, initialFocusRef });

  if (!mounted) return null;

  // Only a press that starts and ends on the backdrop closes (a text selection dragged out doesn't).
  const handleBackdropDown = (event: MouseEvent<HTMLDivElement>) => {
    backdropPressed.current = event.target === event.currentTarget;
  };
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && backdropPressed.current && event.target === event.currentTarget) onClose();
    backdropPressed.current = false;
  };

  const hasBody = children !== undefined && children !== null && children !== false;
  const content = (
    <>
      {hasBody && <div className={styles.body}>{children}</div>}
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </>
  );

  return (
    <Portal>
      <div className={cx(styles.root, placement === "bottom" && styles.bottom)} data-state={closing ? "closed" : "open"}>
        <div className={styles.backdrop} aria-hidden="true" onMouseDown={handleBackdropDown} onClick={handleBackdropClick} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cx(styles.panel, styles[size], className)}
        >
          <span className={styles.grabber} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.headings}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className={styles.description}>
                  {description}
                </p>
              )}
            </div>
            {!hideClose && <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={onClose} />}
          </header>
          {onSubmit ? (
            <form className={styles.form} noValidate onSubmit={onSubmit}>
              {content}
            </form>
          ) : (
            content
          )}
        </div>
      </div>
    </Portal>
  );
}
