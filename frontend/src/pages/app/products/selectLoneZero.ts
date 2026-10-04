import type { FocusEvent } from "react";

/**
 * Selects a lone "0" when a number field inside the element gets focus, so typing replaces it
 * instead of landing next to it ("120" when "12" was meant). Use on a wrapper:
 * `<div onFocus={selectLoneZero}><QuantityInput … /></div>`.
 */
export function selectLoneZero(event: FocusEvent<HTMLElement>): void {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.value !== "0") return;
  target.select();
  // The mouseup of the click that focused the field would otherwise drop the selection again.
  target.addEventListener("mouseup", (mouseEvent) => mouseEvent.preventDefault(), { once: true });
}
