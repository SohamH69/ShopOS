// Positions a fixed popover (menu, combobox list) next to its anchor, flipping above when there is
// more room there, clamped inside the viewport, and following scroll/resize.

import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export interface AnchoredPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  popoverRef: RefObject<HTMLElement | null>;
  /** Align the popover's left edge with the anchor ("start") or its right edge ("end"). */
  align?: "start" | "end";
  /** Make the popover exactly as wide as the anchor. */
  matchWidth?: boolean;
  gap?: number;
  maxHeight?: number;
}

// The first render is transparent while it is measured; opacity (not visibility) keeps items focusable.
const HIDDEN: CSSProperties = { position: "fixed", top: 0, left: 0, opacity: 0, pointerEvents: "none" };
const MARGIN = 8;

function sameStyle(a: CSSProperties, b: CSSProperties): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof CSSProperties>;
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
}

export function useAnchoredPosition({
  open,
  anchorRef,
  popoverRef,
  align = "start",
  matchWidth = false,
  gap = 6,
  maxHeight = 360,
}: AnchoredPositionOptions): { style: CSSProperties; update: () => void } {
  const [style, setStyle] = useState<CSSProperties>(HIDDEN);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const popover = popoverRef.current;
    if (!anchor || !popover) return;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = matchWidth ? rect.width : popover.offsetWidth;
    const below = viewportHeight - rect.bottom - gap - MARGIN;
    const above = rect.top - gap - MARGIN;
    const wanted = Math.min(popover.scrollHeight, maxHeight);
    const placeBelow = below >= wanted || below >= above;
    const available = Math.max(120, placeBelow ? below : above);

    let left = align === "end" ? rect.right - width : rect.left;
    left = Math.max(MARGIN, Math.min(left, viewportWidth - width - MARGIN));

    const next: CSSProperties = {
      position: "fixed",
      left: Math.round(left),
      maxHeight: Math.round(Math.min(maxHeight, available)),
    };
    if (matchWidth) next.width = Math.round(rect.width);
    if (placeBelow) next.top = Math.round(rect.bottom + gap);
    else next.bottom = Math.round(viewportHeight - rect.top + gap);
    setStyle((previous) => (sameStyle(previous, next) ? previous : next));
  }, [anchorRef, popoverRef, align, matchWidth, gap, maxHeight]);

  useLayoutEffect(() => {
    if (!open) {
      setStyle(HIDDEN);
      return;
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, update]);

  return { style, update };
}
