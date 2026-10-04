import { CircleAlert } from "lucide-react";
import { cx } from "../../../lib/cx";
import styles from "./FormError.module.css";

/** The server's reason a save failed, shown inside the form (announced to screen readers). */
export function FormError({ message, className }: { message: string | null | undefined; className?: string }) {
  if (!message) return null;
  return (
    <p className={cx(styles.error, className)} role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
