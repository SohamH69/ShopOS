import { X } from "lucide-react";
import { useId, useRef, type CSSProperties, type FormEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { cx } from "../../lib/cx";
import { IconButton } from "./Button";
import styles from "./Modal.module.css";
import { usePresence, useOverlayLayer } from "./overlay";
import { Portal } from "./Portal";
import { cleanId } from "./utils";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Heading text or element (e.g. a mono order number). Used as the dialog's name. */
  title: ReactNode;
  description?: ReactNode;
  /** Buttons/menu next to the close button. */
  headerActions?: ReactNode;
  children?: ReactNode;
  /** Sticky bottom bar. */
  footer?: ReactNode;
  /** Width in px on larger screens (default 520). Full screen below 640px. */
  width?: number;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Wraps body and footer in a <form noValidate>. */
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
  bodyClassName?: string;
}

/** Right-side sheet in a portal (full screen on phones), with the same focus and Esc handling as Modal. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  headerActions,
  children,
  footer,
  width = 520,
  initialFocusRef,
  onSubmit,
  className,
  bodyClassName,
}: DrawerProps) {
  const { mounted, closing } = usePresence(open, 180);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropPressed = useRef(false);
  const id = cleanId(useId());
  const titleId = `drawer-${id}-title`;
  const descriptionId = `drawer-${id}-description`;

  useOverlayLayer({ open, onClose, panelRef, initialFocusRef });

  if (!mounted) return null;

  const handleBackdropDown = (event: MouseEvent<HTMLDivElement>) => {
    backdropPressed.current = event.target === event.currentTarget;
  };
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (backdropPressed.current && event.target === event.currentTarget) onClose();
    backdropPressed.current = false;
  };

  const content = (
    <>
      <div className={cx(styles.body, styles.drawerBody, bodyClassName)}>{children}</div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </>
  );

  return (
    <Portal>
      <div className={cx(styles.root, styles.drawerRoot)} data-state={closing ? "closed" : "open"}>
        <div className={styles.backdrop} aria-hidden="true" onMouseDown={handleBackdropDown} onClick={handleBackdropClick} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cx(styles.panel, styles.drawer, className)}
          style={{ "--drawer-width": `${width}px` } as CSSProperties}
        >
          <header className={cx(styles.header, styles.drawerHeader)}>
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
            <div className={styles.headerActions}>
              {headerActions}
              <IconButton label="Close" icon={<X aria-hidden="true" />} onClick={onClose} />
            </div>
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
