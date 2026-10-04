// Small, general-purpose React hooks used across pages.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";

/** Returns `value` after it has stopped changing for `delay` ms. Use with primitives (strings, numbers). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Media queries the layout is built on. */
export const MEDIA = {
  /** Phones: bottom sheets, full-screen drawers. */
  mobile: "(max-width: 639px)",
  /** Below the sidebar breakpoint: bottom tab bar and floating New order button. */
  belowDesktop: "(max-width: 1023px)",
  desktop: "(min-width: 1024px)",
  reducedMotion: "(prefers-reduced-motion: reduce)",
} as const;

/** Live result of a CSS media query, e.g. `useMediaQuery(MEDIA.mobile)`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(MEDIA.reducedMotion);
}

/** Sets `document.title` to "Title · ShopOS" (or exactly `title` with `{ exact: true }`). */
export function useDocumentTitle(title: string | null | undefined, options: { exact?: boolean } = {}): void {
  const { exact = false } = options;
  useEffect(() => {
    if (!title) document.title = "ShopOS";
    else document.title = exact ? title : `${title} · ShopOS`;
  }, [title, exact]);
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
}

/** "⌘" on Apple devices, "Ctrl" elsewhere — for shortcut hints like "Ctrl K". */
export function modifierKeyLabel(): string {
  return isMacPlatform() ? "⌘" : "Ctrl";
}

const NON_TEXT_INPUTS = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);

/** True when a key press is going into a text field (so single-letter shortcuts must not fire). */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
  return false;
}

function matchesCombo(event: KeyboardEvent, combo: string, mac: boolean): boolean {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts[parts.length - 1];
  const mod = parts.includes("mod");
  const wantCtrl = parts.includes("ctrl") || (mod && !mac);
  const wantMeta = parts.includes("meta") || (mod && mac);
  if (event.ctrlKey !== wantCtrl || event.metaKey !== wantMeta) return false;
  if (event.altKey !== parts.includes("alt") || event.shiftKey !== parts.includes("shift")) return false;
  const pressed = event.key.toLowerCase();
  if (key === "esc" || key === "escape") return pressed === "escape";
  if (key === "space") return pressed === " ";
  return pressed === key;
}

export interface HotkeyOptions {
  enabled?: boolean;
  /** Also fire while typing in inputs (for chords like "mod+k"). Default false. */
  allowInInputs?: boolean;
  /** Default true. */
  preventDefault?: boolean;
}

/**
 * Global keyboard shortcut. Combos: "n", "mod+k" (Ctrl on Windows, ⌘ on Mac), "mod+enter", "shift+?", "escape".
 * Ignored while typing in a field (unless allowInInputs), during IME composition, and when another
 * handler already called preventDefault().
 */
export function useHotkey(
  combo: string | readonly string[],
  handler: (event: KeyboardEvent) => void,
  options: HotkeyOptions = {},
): void {
  const { enabled = true, allowInInputs = false, preventDefault = true } = options;
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  const comboKey = typeof combo === "string" ? combo : combo.join("|");

  useEffect(() => {
    if (!enabled) return;
    const mac = isMacPlatform();
    const combos = comboKey.split("|");
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing) return;
      if (!allowInInputs && isTypingTarget(event.target)) return;
      if (!combos.some((item) => matchesCombo(event, item, mac))) return;
      if (preventDefault) event.preventDefault();
      handlerRef.current(event);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, allowInInputs, preventDefault, comboKey]);
}

// ---------------------------------------------------------------------------
// Browser state
// ---------------------------------------------------------------------------

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/** False while the device has no network connection. */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Copies text to the clipboard; `copied` stays true for `resetMs` after a successful copy. */
export function useCopyToClipboard(resetMs = 2000): { copy: (text: string) => Promise<boolean>; copied: boolean } {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const copy = useCallback(
    async (text: string) => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // Clipboard API needs a secure context; fall back to a hidden textarea.
        try {
          const area = document.createElement("textarea");
          area.value = text;
          area.setAttribute("readonly", "");
          area.style.position = "fixed";
          area.style.opacity = "0";
          document.body.appendChild(area);
          area.select();
          ok = document.execCommand("copy");
          area.remove();
        } catch {
          ok = false;
        }
      }
      if (ok) {
        setCopied(true);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setCopied(false), resetMs);
      }
      return ok;
    },
    [resetMs],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { copy, copied };
}

/** Width and height of an element, kept current with ResizeObserver. Attach `ref` to the element. */
export function useElementSize<T extends HTMLElement>(): {
  ref: (node: T | null) => (() => void) | undefined;
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const ref = useCallback((node: T | null) => {
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height ? previous : { width: rect.width, height: rect.height },
      );
    };
    update();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}

/**
 * One URL search param as state, e.g. `const [tab, setTab] = useSearchParam("tab", "pickups")`.
 * Setting the default value (or "" / null) removes the param. Updates replace the history entry.
 * Keep text inputs in local state and sync them here debounced.
 */
export function useSearchParam(key: string, defaultValue = ""): [string, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback(
    (next: string | null) => {
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (next === null || next === "" || next === defaultValue) updated.delete(key);
          else updated.set(key, next);
          return updated;
        },
        { replace: true },
      );
    },
    [key, defaultValue, setParams],
  );
  return [value, setValue];
}

/** Runs `callback` when the browser is idle (or after a short delay). Returns a cancel function. */
export function onIdle(callback: () => void, timeout = 2000): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(callback, 600);
  return () => window.clearTimeout(timer);
}
