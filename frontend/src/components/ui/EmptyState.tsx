import { CircleAlert, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { errorMessage } from "../../lib/api";
import { cx } from "../../lib/cx";
import { Button } from "./Button";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  /** What's empty, plainly: "No pickups waiting." */
  title: ReactNode;
  /** What to do next: "New orders marked for pickup show up here." */
  description?: ReactNode;
  /** The next action, e.g. a Button. */
  action?: ReactNode;
  /** Optional quiet icon (ink-4, no coloured circle). */
  icon?: ReactNode;
  /** Less padding, for cards and drawers. */
  compact?: boolean;
  className?: string;
}

/** An empty view that invites the next action. */
export function EmptyState({ title, description, action, icon, compact = false, className }: EmptyStateProps) {
  return (
    <div className={cx(styles.root, compact && styles.compact, className)}>
      {icon && (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  /** Default "This didn't load". */
  title?: ReactNode;
  /** The thrown error; its message (ApiError.message) is shown. */
  error?: unknown;
  /** Overrides the message taken from `error`. */
  description?: ReactNode;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  retrying?: boolean;
  compact?: boolean;
  className?: string;
}

/** A failed load: what happened and a way to try again. */
export function ErrorState({
  title = "This didn't load",
  error,
  description,
  onRetry,
  retrying = false,
  compact = false,
  className,
}: ErrorStateProps) {
  const message =
    description ?? (error ? errorMessage(error) : "Check your internet connection and try again.");
  return (
    <div role="alert" className={cx(styles.root, styles.error, compact && styles.compact, className)}>
      <span className={styles.icon} aria-hidden="true">
        <CircleAlert />
      </span>
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{message}</p>
      {onRetry && (
        <div className={styles.action}>
          <Button size="sm" icon={<RotateCw aria-hidden="true" />} loading={retrying} onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
