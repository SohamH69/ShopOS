import { useCallback, useState } from "react";

/** What a dialog shows, whether it is open, and a key that remounts it on every open. */
export interface DialogState<T> {
  value: T;
  open: boolean;
  key: number;
}

let nextKey = 0;

/**
 * State for modals and drawers that start with a fresh form on every open but keep their content
 * while they animate out. Render them as
 * `{dialog.state && <MyModal key={dialog.state.key} open={dialog.state.open} … />}`.
 */
export function useDialogState<T>() {
  const [state, setState] = useState<DialogState<T> | null>(null);

  const show = useCallback((value: T) => {
    nextKey += 1;
    setState({ value, open: true, key: nextKey });
  }, []);

  const close = useCallback(() => {
    setState((current) => (current && current.open ? { ...current, open: false } : current));
  }, []);

  return { state, show, close };
}
