import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/** Renders children at the end of <body> (outside #root), for overlays and popovers. */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
