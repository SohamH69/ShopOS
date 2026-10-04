import type { Ref } from "react";

/** Writes a DOM node into a callback ref or ref object (for components that need their own ref too). */
export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

/** Space-joined id list for aria-describedby, or undefined when empty. */
export function joinIds(...ids: Array<string | null | undefined | false>): string | undefined {
  const joined = ids.filter(Boolean).join(" ");
  return joined || undefined;
}

/** A useId() value made safe for ids, CSS selectors and url(#…) references. */
export function cleanId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}
