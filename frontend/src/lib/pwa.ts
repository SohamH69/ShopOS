// Progressive Web App helpers: service worker registration and the install prompt.
// `beforeinstallprompt` is captured from module load (main.tsx imports this module first thing),
// so the "Install ShopOS" button works even if the event fires before any component mounts.

import { useCallback, useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallPlatform = "android" | "ios" | "windows" | "mac" | "linux" | "other";
export type InstallBrowser = "chrome" | "edge" | "safari" | "firefox" | "samsung" | "other";
export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

interface InstallSnapshot {
  canInstall: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  platform: InstallPlatform;
  browser: InstallBrowser;
}

export interface InstallPrompt extends InstallSnapshot {
  /** Opens the browser's install dialog. Resolves "unavailable" when the browser offers none. */
  promptInstall: () => Promise<InstallOutcome>;
}

const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";

function detectPlatform(): InstallPlatform {
  if (!isBrowser) return "other";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Windows/i.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux|CrOS/i.test(ua)) return "linux";
  return "other";
}

function detectBrowser(): InstallBrowser {
  if (!isBrowser) return "other";
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Edg(e|A|iOS)?\//i.test(ua)) return "edge";
  if (/Firefox|FxiOS/i.test(ua)) return "firefox";
  if (/Chrome|CriOS|Chromium/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

function detectStandalone(): boolean {
  if (!isBrowser) return false;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installedThisSession = false;
const listeners = new Set<() => void>();

function buildSnapshot(): InstallSnapshot {
  const isStandalone = detectStandalone();
  return {
    canInstall: deferredPrompt !== null && !isStandalone,
    isInstalled: installedThisSession || isStandalone,
    isStandalone,
    platform: detectPlatform(),
    browser: detectBrowser(),
  };
}

let snapshot: InstallSnapshot = buildSnapshot();

function emit(): void {
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
}

if (isBrowser) {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Keep the browser's mini-infobar from showing; we offer our own button.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installedThisSession = true;
    deferredPrompt = null;
    emit();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): InstallSnapshot {
  return snapshot;
}

async function promptInstall(): Promise<InstallOutcome> {
  const event = deferredPrompt;
  if (!event) return "unavailable";
  // The event can only be used once.
  deferredPrompt = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === "accepted") installedThisSession = true;
    return choice.outcome;
  } catch {
    return "unavailable";
  } finally {
    emit();
  }
}

/** Install state for the "Get the app" UI: `{ canInstall, promptInstall, isInstalled, isStandalone, platform, browser }`. */
export function useInstallPrompt(): InstallPrompt {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const prompt = useCallback(() => promptInstall(), []);
  return { ...state, promptInstall: prompt };
}

/** Registers /sw.js once the page has loaded (production and dev). Safe to call more than once. */
export function registerServiceWorker(): void {
  if (!isBrowser || !("serviceWorker" in navigator)) return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      if (import.meta.env.DEV) console.warn("ShopOS service worker was not registered:", error);
    });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
