// Editable order lines, shared by the new order sheet and the order drawer's "Edit items".
// Totals use lib/money, which rounds exactly like the backend, so what the form shows is what
// the server stores.

import { lineTotal, orderTotals, roundQty, toPaise, type OrderTotals } from "../../lib/money";
import type { OrderItem, OrderItemInput, Product } from "../../lib/types";

export interface DraftLine {
  /** Stable React key. */
  key: string;
  /** null for a custom (non-inventory) item. */
  productId: number | null;
  name: string;
  unit: string;
  quantity: number;
  /** null while the price field is empty. */
  unitPrice: number | null;
  /** null when the line has no discount. */
  discount: number | null;
  /** The discount field is showing. */
  discountOpen: boolean;
}

export type LineField = "name" | "price" | "quantity" | "discount";

export interface LineIssue {
  field: LineField;
  message: string;
}

let lastKey = 0;

function nextKey(): string {
  lastKey += 1;
  return `line-${lastKey}`;
}

const LOOSE_UNITS = new Set(["kg", "l"]);
const SMALL_UNITS = new Set(["g", "ml"]);

/** Quantity of a freshly added line: 1 of most things, 100 g / ml of goods sold by the gram. */
export function defaultQuantity(unit: string): number {
  return SMALL_UNITS.has(unit) ? 100 : 1;
}

/** The smallest quantity a line can hold (a line is removed with its × button, never stepped to 0). */
export function minQuantity(unit: string): number {
  if (LOOSE_UNITS.has(unit)) return 0.05;
  if (SMALL_UNITS.has(unit)) return 10;
  if (unit === "dozen") return 0.5;
  return 1;
}

export function lineFromProduct(product: Product, quantity = defaultQuantity(product.unit)): DraftLine {
  return {
    key: nextKey(),
    productId: product.id,
    name: product.name,
    unit: product.unit,
    quantity,
    unitPrice: product.selling_price,
    discount: null,
    discountOpen: false,
  };
}

export function customLine(name = "", unitPrice: number | null = null, quantity = 1): DraftLine {
  return { key: nextKey(), productId: null, name, unit: "pcs", quantity, unitPrice, discount: null, discountOpen: false };
}

/** Adds a product, or one more of it when it's already on the order. */
export function addProductLine(lines: readonly DraftLine[], product: Product): DraftLine[] {
  const existing = lines.find((line) => line.productId === product.id);
  if (!existing) return [...lines, lineFromProduct(product)];
  const quantity = roundQty(existing.quantity + defaultQuantity(existing.unit));
  return lines.map((line) => (line.key === existing.key ? { ...line, quantity } : line));
}

/** Appends lines, adding quantities together when a product is already on the order. */
export function mergeLines(current: readonly DraftLine[], incoming: readonly DraftLine[]): DraftLine[] {
  const result = current.slice();
  for (const line of incoming) {
    const index = line.productId === null ? -1 : result.findIndex((entry) => entry.productId === line.productId);
    if (index === -1) result.push(line);
    else result[index] = { ...result[index], quantity: roundQty(result[index].quantity + line.quantity) };
  }
  return result;
}

/** The order's own lines, prices and discounts as they were sold (for editing an order). */
export function linesFromOrderItems(items: readonly OrderItem[]): DraftLine[] {
  return items.map((item) => ({
    key: nextKey(),
    productId: item.product_id,
    name: item.name,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    discount: item.discount > 0 ? item.discount : null,
    discountOpen: item.discount > 0,
  }));
}

/**
 * Lines for items being sold again (a prefilled or repeated order): products at today's price unless
 * a price is given, custom items at their price. Products no longer sold are skipped and named.
 */
export function linesForItems(
  items: readonly OrderItemInput[],
  products: ReadonlyMap<number, Product>,
): { lines: DraftLine[]; skipped: string[] } {
  const lines: DraftLine[] = [];
  const skipped: string[] = [];
  for (const item of items) {
    if (item.quantity <= 0) continue;
    if (item.product_id != null) {
      const product = products.get(item.product_id);
      if (!product || product.is_archived) {
        skipped.push(item.name ?? product?.name ?? "An item");
        continue;
      }
      const line = lineFromProduct(product, roundQty(item.quantity));
      if (item.unit_price != null) line.unitPrice = item.unit_price;
      if (item.discount != null && item.discount > 0) {
        line.discount = item.discount;
        line.discountOpen = true;
      }
      lines.push(line);
    } else if (item.name && item.unit_price != null) {
      lines.push(customLine(item.name, item.unit_price, roundQty(item.quantity)));
    }
  }
  return { lines, skipped };
}

/** OrderItem → OrderItemInput for selling the same things again (products re-priced, custom kept). */
export function repeatItemsOf(items: readonly OrderItem[]): OrderItemInput[] {
  return items.map((item) =>
    item.product_id !== null
      ? { product_id: item.product_id, name: item.name, quantity: item.quantity }
      : { name: item.name, quantity: item.quantity, unit_price: item.unit_price },
  );
}

/** "Garam Masala 50 g is no longer sold, so it was left out." */
export function skippedItemsMessage(skipped: readonly string[]): string | null {
  if (skipped.length === 0) return null;
  if (skipped.length === 1) return `${skipped[0]} is no longer sold, so it was left out.`;
  return `${skipped.length} items are no longer sold, so they were left out: ${skipped.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

export function draftLineGross(line: DraftLine): number {
  return lineTotal(line.quantity, line.unitPrice ?? 0, 0);
}

export function draftLineTotal(line: DraftLine): number {
  return lineTotal(line.quantity, line.unitPrice ?? 0, line.discount ?? 0);
}

export function draftTotals(lines: readonly DraftLine[], orderDiscount: number): OrderTotals {
  return orderTotals(
    lines.map((line) => ({ quantity: line.quantity, unit_price: line.unitPrice ?? 0, discount: line.discount ?? 0 })),
    orderDiscount,
  );
}

// ---------------------------------------------------------------------------
// Validation and the API shape
// ---------------------------------------------------------------------------

/** The first problem on each line, keyed by line key. Empty when every line can be saved. */
export function validateLines(lines: readonly DraftLine[]): Record<string, LineIssue> {
  const issues: Record<string, LineIssue> = {};
  for (const line of lines) {
    if (line.productId === null && !line.name.trim()) {
      issues[line.key] = { field: "name", message: "Give this item a name." };
    } else if (line.unitPrice === null) {
      issues[line.key] = { field: "price", message: "Enter a price." };
    } else if (line.quantity <= 0) {
      issues[line.key] = { field: "quantity", message: "Enter a quantity more than 0." };
    } else if (toPaise(line.discount ?? 0) > toPaise(draftLineGross(line))) {
      issues[line.key] = { field: "discount", message: "The discount is more than this line's amount." };
    }
  }
  return issues;
}

/** Lines as the API expects them. Prices are always sent, so the order is saved exactly as shown. */
export function toItemInputs(lines: readonly DraftLine[]): OrderItemInput[] {
  return lines.map((line) => {
    const discount = line.discount !== null && line.discount > 0 ? line.discount : undefined;
    const unit_price = line.unitPrice ?? 0;
    return line.productId === null
      ? { name: line.name.trim(), quantity: line.quantity, unit_price, discount }
      : { product_id: line.productId, quantity: line.quantity, unit_price, discount };
  });
}

/** True when two sets of lines would save the same items. */
export function sameItems(a: readonly DraftLine[], b: readonly DraftLine[]): boolean {
  return JSON.stringify(toItemInputs(a)) === JSON.stringify(toItemInputs(b));
}
