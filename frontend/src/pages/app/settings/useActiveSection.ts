import { useEffect, useState } from "react";

/**
 * The id of the section currently being read: the first one crossing a band just below the sticky
 * top bar. At the very bottom of the page the last section wins, even if it is short.
 */
export function useActiveSection(ids: readonly string[]): string {
  const key = ids.join("|");
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    const elements = key
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0 || typeof IntersectionObserver === "undefined") return undefined;

    const visible = new Set<string>();
    const pick = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const current = atBottom ? elements[elements.length - 1] : elements.find((element) => visible.has(element.id));
      if (current) setActive(current.id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        pick();
      },
      // A band from just under the 56px top bar to the middle of the screen.
      { rootMargin: "-72px 0px -50% 0px" },
    );
    elements.forEach((element) => observer.observe(element));
    window.addEventListener("scroll", pick, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", pick);
    };
  }, [key]);

  return active;
}
