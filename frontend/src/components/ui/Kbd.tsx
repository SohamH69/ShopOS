import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Small.module.css";

export interface KbdProps {
  children: ReactNode;
  className?: string;
}

/** A keyboard key hint: <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>. Use modifierKeyLabel() for Ctrl/⌘. */
export function Kbd({ children, className }: KbdProps) {
  return <kbd className={cx(styles.kbd, className)}>{children}</kbd>;
}
