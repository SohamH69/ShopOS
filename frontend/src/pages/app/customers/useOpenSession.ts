import { useState } from "react";

/**
 * A number that goes up every time `open` turns true. Use it as the `key` of a dialog's form so each
 * opening starts from fresh values, while closing keeps the same key so the exit animation can play.
 */
export function useOpenSession(open: boolean): number {
  const [session, setSession] = useState(0);
  const [lastOpen, setLastOpen] = useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setSession(session + 1);
  }
  return session;
}
