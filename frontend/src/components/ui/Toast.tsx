import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { Portal } from "./Portal";
import styles from "./Toast.module.css";

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  /** Runs, then the toast closes. */
  onClick?: () => void;
  /** Renders a link instead (e.g. a wa.me message). */
  href?: string;
  newTab?: boolean;
}

export interface ToastOptions {
  description?: ReactNode;
  action?: ToastAction;
  secondaryAction?: ToastAction;
  /** ms before it closes by itself (paused while hovered or focused). */
  duration?: number;
}

export interface ToastApi {
  success: (message: ReactNode, options?: ToastOptions) => number;
  error: (message: ReactNode, options?: ToastOptions) => number;
  info: (message: ReactNode, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

interface ToastRecord extends ToastOptions {
  id: number;
  tone: ToastTone;
  message: ReactNode;
}

const ToastContext = createContext<ToastApi | null>(null);
const MAX_VISIBLE = 3;

/** Provides useToast(). Mount once near the root. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((tone: ToastTone, message: ReactNode, options: ToastOptions = {}) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((list) => [...list.slice(-(MAX_VISIBLE - 1)), { id, tone, message, ...options }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push("success", message, options),
      error: (message, options) => push("error", message, options),
      info: (message, options) => push("info", message, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Portal>
        <section className={styles.viewport} aria-label="Notifications">
          <ol className={styles.list} aria-live="polite" aria-relevant="additions text">
            {toasts.map((toast) => (
              <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
            ))}
          </ol>
        </section>
      </Portal>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CircleCheck aria-hidden="true" />,
  error: <CircleAlert aria-hidden="true" />,
  info: <Info aria-hidden="true" />,
};

function ToastItem({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const duration = toast.duration ?? (toast.tone === "error" || toast.action ? 7000 : 4500);
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const remaining = useRef(duration);

  const close = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(toast.id), 150);
  }, [onDismiss, toast.id]);

  useEffect(() => {
    if (paused || leaving) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(close, remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(800, remaining.current - (Date.now() - startedAt));
    };
  }, [paused, leaving, close]);

  const renderAction = (action: ToastAction | undefined, key: string) => {
    if (!action) return null;
    const handle = () => {
      action.onClick?.();
      close();
    };
    return action.href ? (
      <a
        key={key}
        className={styles.action}
        href={action.href}
        target={action.newTab ? "_blank" : undefined}
        rel={action.newTab ? "noopener noreferrer" : undefined}
        onClick={handle}
      >
        {action.label}
      </a>
    ) : (
      <button key={key} type="button" className={styles.action} onClick={handle}>
        {action.label}
      </button>
    );
  };

  return (
    <li
      className={cx(styles.toast, styles[toast.tone], leaving && styles.leaving)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className={styles.icon}>{ICONS[toast.tone]}</span>
      <div className={styles.content}>
        <p className={styles.message}>{toast.message}</p>
        {toast.description && <p className={styles.description}>{toast.description}</p>}
        {(toast.action || toast.secondaryAction) && (
          <div className={styles.actions}>
            {renderAction(toast.action, "primary")}
            {renderAction(toast.secondaryAction, "secondary")}
          </div>
        )}
      </div>
      <button type="button" className={styles.dismiss} aria-label="Dismiss notification" onClick={close}>
        <X aria-hidden="true" />
      </button>
    </li>
  );
}

/** `const toast = useToast(); toast.success("Payment recorded", { action: { label: "Undo", onClick } })`. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside <ToastProvider>.");
  return context;
}
