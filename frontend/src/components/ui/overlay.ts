// Shared behaviour for modal overlays (Modal, Drawer, CommandPalette):
// a stack so only the top overlay reacts to Esc and traps Tab, a ref-counted scroll lock,
// the app root made inert while anything is open, initial focus and focus restore,
// plus a tiny presence hook so overlays can animate out before unmounting.

import { useEffect, useRef, useState, type RefObject } from "react";

const openLayers: symbol[] = [];
let scrollLocks = 0;
let savedOverflow = "";
let savedPaddingRight = "";

function lockScroll(): void {
  if (scrollLocks === 0) {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
  }
  scrollLocks += 1;
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
}

// Overlays render in portals on <body>, so making #root inert hides the page behind them
// from keyboard and screen readers without touching the overlays themselves.
function setAppInert(inert: boolean): void {
  const root = document.getElementById("root");
  if (root) root.inert = inert;
}

const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(",");

export function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0,
  );
}

// React applies `autoFocus` inside a new overlay before our effect runs, so by then the opener has
// already lost focus. Remembering the previously focused element lets us still return to it.
let currentFocus: HTMLElement | null = null;
let previousFocus: HTMLElement | null = null;
if (typeof document !== "undefined") {
  document.addEventListener(
    "focusin",
    (event) => {
      if (event.target instanceof HTMLElement && event.target !== currentFocus) {
        previousFocus = currentFocus;
        currentFocus = event.target;
      }
    },
    true,
  );
}

function openerFor(panel: HTMLElement | null): HTMLElement | null {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (panel && active && panel.contains(active)) return previousFocus;
  return active;
}

/** True when any modal overlay is open (used to pause single-key shortcuts). */
export function isAnyOverlayOpen(): boolean {
  return openLayers.length > 0;
}

export interface OverlayLayerOptions {
  open: boolean;
  onClose: () => void;
  panelRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Return focus to whatever was focused before opening. Default true. */
  restoreFocus?: boolean;
}

export function useOverlayLayer({ open, onClose, panelRef, initialFocusRef, restoreFocus = true }: OverlayLayerOptions): void {
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const layer = Symbol("overlay");
    const previouslyFocused = openerFor(panelRef.current);
    openLayers.push(layer);
    lockScroll();
    setAppInert(true);

    // After paint, so an autoFocus field inside the overlay keeps its focus.
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
      target.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (openLayers[openLayers.length - 1] !== layer) return;
      if (event.key === "Escape") {
        // Inner widgets (combobox lists, menus, search boxes) claim Esc first by preventing default.
        if (event.defaultPrevented) return;
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusableElements(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !current || !panel.contains(current);
      if (event.shiftKey && (outside || current === first || current === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || current === last)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      const index = openLayers.lastIndexOf(layer);
      if (index !== -1) openLayers.splice(index, 1);
      unlockScroll();
      if (openLayers.length === 0) setAppInert(false);
      if (restoreFocus && previouslyFocused && previouslyFocused.isConnected && previouslyFocused !== document.body) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
    // Only `open` matters: the refs are stable and re-running would re-trap focus.
  }, [open]);
}

/**
 * Keeps an overlay mounted for `exitMs` after it closes so it can animate out.
 * `closing` is true during that time (use it for data-state="closed").
 */
export function usePresence(open: boolean, exitMs = 160): { mounted: boolean; closing: boolean } {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // Derived during render (React's "adjust state when a prop changes" pattern).
  if (open && !mounted) setMounted(true);
  if (open && closing) setClosing(false);
  if (!open && mounted && !closing) setClosing(true);

  useEffect(() => {
    if (!closing) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => {
        setMounted(false);
        setClosing(false);
      },
      reduced ? 0 : exitMs,
    );
    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  return { mounted, closing };
}
