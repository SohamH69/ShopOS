// Search-param state for pages with filters and drawers.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useDebouncedValue } from "../../../lib/hooks";

export interface UpdateSearchOptions {
  /** Add a history entry (so Back undoes the change) instead of replacing the current one. */
  push?: boolean;
  /** State for the new entry. By default the current state is kept (the order drawer keeps a flag there). */
  state?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Returns `update(mutate, options)`: changes some search params while keeping every other param
 * (such as ?order=) and the history state. Does nothing when the URL would stay the same.
 */
export function useUpdateSearchParams() {
  const location = useLocation();
  const navigate = useNavigate();
  const latest = useRef(location);

  useLayoutEffect(() => {
    latest.current = location;
  });

  return useCallback(
    (mutate: (params: URLSearchParams) => void, options: UpdateSearchOptions = {}) => {
      const current = latest.current;
      const before = new URLSearchParams(current.search);
      const params = new URLSearchParams(current.search);
      mutate(params);
      const search = params.toString();
      if (search === before.toString()) return;
      navigate(
        { pathname: current.pathname, search: search ? `?${search}` : "", hash: current.hash },
        { replace: !options.push, state: options.state === undefined ? current.state : options.state },
      );
    },
    [navigate],
  );
}

/** Sets `key` to `value`, or removes it when the value is empty. */
export function setParam(params: URLSearchParams, key: string, value: string | null | undefined): void {
  if (value) params.set(key, value);
  else params.delete(key);
}

/**
 * A text filter that updates instantly in local state and is mirrored to `?key=` after a pause,
 * so the URL stays shareable without a navigation per keystroke. Follows the URL when it changes
 * from elsewhere (for example the Back button).
 */
export function useSearchText(key: string, delay = 300): [string, (value: string) => void] {
  const [params] = useSearchParams();
  const urlValue = params.get(key) ?? "";
  const [text, setText] = useState(urlValue);
  const [seenUrlValue, setSeenUrlValue] = useState(urlValue);

  if (urlValue !== seenUrlValue) {
    setSeenUrlValue(urlValue);
    if (urlValue !== text.trim()) setText(urlValue);
  }

  const debounced = useDebouncedValue(text.trim(), delay);
  const update = useUpdateSearchParams();

  useEffect(() => {
    update((next) => setParam(next, key, debounced));
  }, [debounced, key, update]);

  return [text, setText];
}

/** A positive integer id from a route or search param, or null. */
export function parseId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
