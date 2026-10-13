import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "../../lib/hooks";

export interface InViewOptions {
  threshold?: number;
  rootMargin?: string;
}

/**
 * True once the element has scrolled into view, and from then on. With reduced motion, or without
 * IntersectionObserver, it is true straight away so no content ever waits on an animation.
 */
export function useInView<T extends Element>({ threshold = 0.3, rootMargin = "0px 0px -8% 0px" }: InViewOptions = {}) {
  const ref = useRef<T>(null);
  const reduceMotion = usePrefersReducedMotion();
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen || reduceMotion) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          setSeen(true);
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen, reduceMotion, threshold, rootMargin]);

  return [ref, seen || reduceMotion] as const;
}
