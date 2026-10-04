import { EllipsisVertical, MonitorDown, Share, SquarePlus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { InstallBrowser, InstallPlatform } from "../../lib/pwa";
import styles from "./GetAppSection.module.css";

/** The three install guides offered when the browser has no install button of its own. */
export type GuidePlatform = "android" | "ios" | "desktop";

export const GUIDE_OPTIONS: ReadonlyArray<{ value: GuidePlatform; label: string }> = [
  { value: "android", label: "Android" },
  { value: "ios", label: "iPhone" },
  { value: "desktop", label: "Windows & Mac" },
];

/** The guide to show first: the visitor's own device. */
export function guideFor(platform: InstallPlatform): GuidePlatform {
  if (platform === "android") return "android";
  if (platform === "ios") return "ios";
  return "desktop";
}

export interface GuideStep {
  key: string;
  content: ReactNode;
}

export interface InstallGuide {
  steps: GuideStep[];
  /** A caveat for this exact browser, e.g. Firefox on a computer can't install apps. */
  note?: ReactNode;
}

/** A browser control drawn inline in a step, e.g. the Share button. The text always names it too. */
function Glyph({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className={styles.glyph}>
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

const ANDROID: InstallGuide = {
  steps: [
    { key: "open", content: <>Open this page in <strong>Chrome</strong>.</> },
    {
      key: "menu",
      content: (
        <>
          Tap the menu <Glyph icon={EllipsisVertical} /> in the top-right corner.
        </>
      ),
    },
    {
      key: "install",
      content: (
        <>
          Tap <strong>Install app</strong> (on some phones, <strong>Add to Home screen</strong>), then{" "}
          <strong>Install</strong>.
        </>
      ),
    },
  ],
};

const IPHONE: InstallGuide = {
  steps: [
    { key: "open", content: <>Open this page in <strong>Safari</strong>.</> },
    {
      key: "share",
      content: (
        <>
          Tap <strong>Share</strong> <Glyph icon={Share} /> in the toolbar.
        </>
      ),
    },
    {
      key: "add",
      content: (
        <>
          Tap <strong>Add to Home Screen</strong> <Glyph icon={SquarePlus} />, then <strong>Add</strong>.
        </>
      ),
    },
  ],
};

const CHROME_OR_EDGE: InstallGuide = {
  steps: [
    {
      key: "open",
      content: (
        <>
          Open this page in <strong>Chrome</strong> or <strong>Edge</strong>.
        </>
      ),
    },
    {
      key: "icon",
      content: (
        <>
          Click the install icon <Glyph icon={MonitorDown} /> at the right end of the address bar.
        </>
      ),
    },
    { key: "install", content: <>Click <strong>Install</strong>. ShopOS opens in its own window.</> },
  ],
};

const MAC_SAFARI: InstallGuide = {
  steps: [
    { key: "open", content: <>Open this page in <strong>Safari</strong> on your Mac.</> },
    {
      key: "menu",
      content: (
        <>
          In the menu bar, choose <strong>File</strong>, then <strong>Add to Dock</strong>.
        </>
      ),
    },
    { key: "add", content: <>Click <strong>Add</strong>. ShopOS opens from your Dock.</> },
  ],
};

const DESKTOP_PLATFORMS: ReadonlySet<InstallPlatform> = new Set(["windows", "mac", "linux", "other"]);

/** Concrete steps for the chosen guide, tuned to the browser the visitor is actually using. */
export function installGuide(guide: GuidePlatform, platform: InstallPlatform, browser: InstallBrowser): InstallGuide {
  if (guide === "android") return ANDROID;
  if (guide === "ios") return IPHONE;
  if (platform === "mac" && browser === "safari") return MAC_SAFARI;
  if (DESKTOP_PLATFORMS.has(platform) && browser === "firefox") {
    return {
      ...CHROME_OR_EDGE,
      note: "Firefox can't install apps on a computer. Open this page in Chrome or Edge to install, or keep using ShopOS right here in Firefox.",
    };
  }
  return CHROME_OR_EDGE;
}
