// Pure helpers for the customer's khata page (/c/:token): the cart, the product list and the khata.
// No React here, so the rules are easy to test.

import { unitStep } from "../../lib/constants";
import { lineTotal, roundQty, sumMoney } from "../../lib/money";
import type { LedgerEntry, PortalOrder, PortalProduct } from "../../lib/types";

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

/** What one tap on "Add" puts in the cart. */
const FIRST: Readonly<Record<string, number>> = {
  pcs: 1,
  pack: 1,
  dozen: 1,
  box: 1,
  kg: 1,
  l: 1,
  g: 100,
  ml: 100,
};

/** "per" form of a unit for price labels: "₹110 / kg", "₹38 / pc". */
const PER: Readonly<Record<string, string>> = {
  pcs: "pc",
  pack: "pack",
  dozen: "dozen",
  box: "box",
  kg: "kg",
  l: "L",
  g: "g",
  ml: "ml",
};

/** Stepper increments: the same as the shop's own order screen (whole packets, quarter kilos, 50 g). */
export function quantityStep(unit: string): number {
  return unitStep(unit);
}

export function firstQuantity(unit: string): number {
  return FIRST[unit] ?? 1;
}

export function perUnit(unit: string): string {
  return PER[unit] ?? unit;
}

/** What follows a unit price: " each" for pieces, " / kg" otherwise. */
export function priceSuffix(unit: string): string {
  return unit === "pcs" ? " each" : ` / ${perUnit(unit)}`;
}

/** Largest quantity of one product in a single order (the server refuses more). */
export const MAX_LINE_QUANTITY = 1000;

// ---------------------------------------------------------------------------
// Cart
// ---------------------------------------------------------------------------

export interface CartItem {
  productId: number;
  quantity: number;
}

/** In the order the customer added things. A quantity of 0 is a line being retyped. */
export type Cart = readonly CartItem[];

export interface CartLine {
  product: PortalProduct;
  quantity: number;
  total: number;
}

/** Sets one product's quantity. 0 removes it, unless `keepZero` (the customer is still typing). */
export function setCartQuantity(cart: Cart, productId: number, quantity: number, keepZero = false): Cart {
  const next = Math.min(Math.max(roundQty(quantity), 0), MAX_LINE_QUANTITY);
  const index = cart.findIndex((item) => item.productId === productId);
  if (next <= 0 && !keepZero) return index < 0 ? cart : cart.filter((item) => item.productId !== productId);
  if (index < 0) return [...cart, { productId, quantity: next }];
  if (cart[index].quantity === next) return cart;
  return cart.map((item) => (item.productId === productId ? { productId, quantity: next } : item));
}

export function cartQuantity(cart: Cart, productId: number): number | undefined {
  return cart.find((item) => item.productId === productId)?.quantity;
}

/** Lines that can be ordered right now: known, in stock, more than 0. */
export function cartLines(cart: Cart, products: readonly PortalProduct[]): CartLine[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  const lines: CartLine[] = [];
  for (const item of cart) {
    const product = byId.get(item.productId);
    if (!product || !product.in_stock || item.quantity <= 0) continue;
    lines.push({ product, quantity: item.quantity, total: lineTotal(item.quantity, product.price) });
  }
  return lines;
}

export function cartTotal(lines: readonly CartLine[]): number {
  return sumMoney(lines.map((line) => line.total));
}

/** Drops lines for products that are gone or out of stock (after the product list loads). */
export function pruneCart(cart: Cart, products: readonly PortalProduct[]): Cart {
  const orderable = new Set(products.filter((product) => product.in_stock).map((product) => product.id));
  const kept = cart.filter((item) => orderable.has(item.productId));
  return kept.length === cart.length ? cart : kept;
}

/** Reads a cart saved in sessionStorage; anything malformed is dropped. */
export function parseStoredCart(raw: string | null): Cart {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items: CartItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const { productId, quantity } = entry as Record<string, unknown>;
      if (typeof productId !== "number" || !Number.isInteger(productId) || productId <= 0) continue;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) continue;
      if (items.some((item) => item.productId === productId)) continue;
      items.push({ productId, quantity: Math.min(roundQty(quantity), MAX_LINE_QUANTITY) });
    }
    return items;
  } catch {
    return [];
  }
}

function cartKey(token: string): string {
  return `shopos.portal.cart.${token}`;
}

/** sessionStorage can be missing or blocked (private mode, previews): the cart then lives in memory only. */
export function loadCart(token: string): Cart {
  try {
    return parseStoredCart(window.sessionStorage.getItem(cartKey(token)));
  } catch {
    return [];
  }
}

export function saveCart(token: string, cart: Cart): void {
  try {
    const items = cart.filter((item) => item.quantity > 0);
    if (items.length === 0) window.sessionStorage.removeItem(cartKey(token));
    else window.sessionStorage.setItem(cartKey(token), JSON.stringify(items));
  } catch {
    // Storage blocked: nothing to do.
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const UNCATEGORISED = "Other";

export interface ProductGroup {
  category: string;
  products: PortalProduct[];
}

function categoryOf(product: PortalProduct): string {
  return product.category.trim() || UNCATEGORISED;
}

/** Categories A to Z ("Other" last), each with its products A to Z. */
export function productCategories(products: readonly PortalProduct[]): string[] {
  const names = [...new Set(products.map(categoryOf))];
  return names.sort((a, b) => {
    if (a === UNCATEGORISED) return 1;
    if (b === UNCATEGORISED) return -1;
    return a.localeCompare(b, "en-IN");
  });
}

export function groupProducts(products: readonly PortalProduct[]): ProductGroup[] {
  return productCategories(products).map((category) => ({
    category,
    products: products
      .filter((product) => categoryOf(product) === category)
      .sort((a, b) => a.name.localeCompare(b.name, "en-IN")),
  }));
}

/** Every word of the search must appear in the product's name or category. */
export function filterProducts(products: readonly PortalProduct[], query: string, category: string | null): PortalProduct[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return products.filter((product) => {
    if (category && categoryOf(product) !== category) return false;
    if (words.length === 0) return true;
    const haystack = `${product.name} ${product.category}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

// ---------------------------------------------------------------------------
// Khata and orders
// ---------------------------------------------------------------------------

/** The API sends the khata oldest first; the page reads newest first. */
export function newestEntriesFirst(entries: readonly LedgerEntry[]): LedgerEntry[] {
  return [...entries].reverse();
}

export function newestOrdersFirst(orders: readonly PortalOrder[]): PortalOrder[] {
  return [...orders].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.number - a.number);
}

/** "Shop 4, Model Colony, Pune 411016" plus the city when the address doesn't already say it. */
export function shopAddress(address: string, city: string): string {
  const street = address.trim();
  const town = city.trim();
  if (!street) return town;
  if (!town || street.toLowerCase().includes(town.toLowerCase())) return street;
  return `${street}, ${town}`;
}

/** Google Maps search for the address when the shop hasn't pinned its location. */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
