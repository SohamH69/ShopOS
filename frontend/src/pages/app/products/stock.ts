// Stock and price arithmetic for the stock, purchase and product screens.
// Mirrors the backend rules so previews match what the server stores.

import { formatQty } from "../../../lib/format";
import { roundMoney, roundQty } from "../../../lib/money";
import type { Product, StockAdjustmentRequest } from "../../../lib/types";

export type AdjustMode = StockAdjustmentRequest["mode"];

/** Stock after an adjustment: add, remove, or set to a counted figure. */
export function stockAfterAdjustment(current: number, mode: AdjustMode, quantity: number): number {
  if (mode === "set") return roundQty(quantity);
  return roundQty(mode === "add" ? current + quantity : current - quantity);
}

/** (sell − buy) ÷ sell × 100, the same rule as Product.margin_percent; null without a selling price. */
export function marginPercent(buy: number | null, sell: number | null): number | null {
  if (sell === null || !(sell > 0)) return null;
  return ((sell - (buy ?? 0)) / sell) * 100;
}

/** Profit on one unit at these prices, in rupees. */
export function marginPerUnit(buy: number | null, sell: number | null): number {
  return roundMoney((sell ?? 0) - (buy ?? 0));
}

/** The unit word after "per": "kg", "pc", "L", "pack". */
export function perUnitLabel(unit: string): string {
  return formatQty(1, unit).replace(/^1\s+/, "");
}

/** "+25 kg", "−2 kg", "0 kg". */
export function signedQty(change: number, unit: string): string {
  const rounded = roundQty(change);
  const text = formatQty(Math.abs(rounded), unit);
  if (rounded > 0) return `+${text}`;
  if (rounded < 0) return `−${text}`;
  return text;
}

/** Name, SKU or category contains the term (case-insensitive), like the server's product search. */
export function matchesSearch(product: Product, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return (
    product.name.toLowerCase().includes(needle) ||
    (product.sku ?? "").toLowerCase().includes(needle) ||
    product.category.toLowerCase().includes(needle)
  );
}

// Lower is more urgent: out of stock first, then the smallest share of the low-stock level left.
function urgency(product: Product): number {
  if (product.stock_quantity <= 0) return -1;
  if (product.min_stock_level <= 0) return Number.POSITIVE_INFINITY;
  return product.stock_quantity / product.min_stock_level;
}

/** Sort comparator for the "Running low" view: the product to reorder first comes first. */
export function byUrgency(a: Product, b: Product): number {
  return urgency(a) - urgency(b) || a.name.localeCompare(b.name);
}

/** Stock value at cost; negative stock counts as nothing on the shelf. */
export function shelfValue(product: Product): number {
  return Math.max(0, product.stock_value);
}
