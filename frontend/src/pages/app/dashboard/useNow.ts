import { useEffect, useState } from "react";

/**
 * The current time in ms, refreshed every `intervalMs`, so relative labels such as
 * "Overdue by 40 min" stay true while the page sits open at the counter all day.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
