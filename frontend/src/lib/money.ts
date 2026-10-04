// Money and quantity arithmetic that mirrors the backend rules (SPEC §2):
// money is integer paise rounded half-up, quantities are rounded to 3 decimals.
// Use these for live totals in forms so the UI agrees with what the server will store.

// Absorbs binary floating point error (1.005 * 100 = 100.49999…) without moving genuine values.
const EPSILON = 1e-6;

function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) + EPSILON);
  return rounded === 0 ? 0 : rounded; // normalise -0
}

/** Rupees → integer paise, rounded half-up. */
export function toPaise(rupees: number): number {
  return roundHalfUp(rupees * 100);
}

/** Integer paise → rupees. */
export function fromPaise(paise: number): number {
  return paise / 100;
}

/** Rounds rupees to the paise (2 decimals), half-up. */
export function roundMoney(rupees: number): number {
  return fromPaise(toPaise(rupees));
}

/** Rounds a quantity to 3 decimals, half-up (2.5 kg, 0.125 kg). */
export function roundQty(quantity: number): number {
  return roundHalfUp(quantity * 1000) / 1000;
}

/** Adds rupee amounts without floating point drift. */
export function sumMoney(values: readonly number[]): number {
  let paise = 0;
  for (const value of values) paise += toPaise(value);
  return fromPaise(paise);
}

/** `round(quantity × unit_price) − discount`, computed in paise exactly like the backend. */
export function lineTotal(quantity: number, unitPrice: number, discount = 0): number {
  const gross = roundHalfUp(quantity * toPaise(unitPrice));
  return fromPaise(gross - toPaise(discount));
}

export interface LineLike {
  quantity: number;
  unit_price: number;
  discount?: number;
}

export interface OrderTotals {
  subtotal: number;
  discount: number;
  total: number;
}

/** Subtotal, order discount and total for a set of order lines. */
export function orderTotals(lines: readonly LineLike[], orderDiscount = 0): OrderTotals {
  let subtotalPaise = 0;
  for (const line of lines) {
    subtotalPaise += toPaise(lineTotal(line.quantity, line.unit_price, line.discount ?? 0));
  }
  const discountPaise = toPaise(orderDiscount);
  return {
    subtotal: fromPaise(subtotalPaise),
    discount: fromPaise(discountPaise),
    total: fromPaise(subtotalPaise - discountPaise),
  };
}
