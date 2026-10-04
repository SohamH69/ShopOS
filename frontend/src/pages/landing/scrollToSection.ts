import type { MouseEvent } from "react";

/**
 * Scrolls to a landing section, writes `#id` into the address bar (so the link can be shared)
 * and moves keyboard focus to the section's heading. Returns false when there is no such section.
 * Sections set `scroll-margin-top` so they clear the sticky header.
 *
 * The hash is written with replaceState, keeping React Router's history state, so the router's own
 * "jump to #hash" handling doesn't fight the smooth scroll.
 */
export function scrollToSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, "", `${pathname}${search}#${id}`);

  const heading = target.querySelector<HTMLElement>("[data-section-heading]") ?? target;
  if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  return true;
}

/** onClick for `<a href="#section">`: smooth in-page scroll, but new-tab clicks behave normally. */
export function handleSectionLinkClick(event: MouseEvent<HTMLAnchorElement>, id: string, after?: () => void): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (after) {
    after();
    // Let an open menu sheet close (and hand focus back) before scrolling and focusing the section.
    window.requestAnimationFrame(() => scrollToSection(id));
  } else {
    scrollToSection(id);
  }
}
