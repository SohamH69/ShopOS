import { describe, expect, it } from "vitest";
import type { LedgerEntry, PortalOrder, PortalProduct } from "../../lib/types";
import {
  cartLines,
  cartTotal,
  filterProducts,
  firstQuantity,
  groupProducts,
  newestEntriesFirst,
  newestOrdersFirst,
  parseStoredCart,
  perUnit,
  priceSuffix,
  pruneCart,
  quantityStep,
  setCartQuantity,
  shopAddress,
  type Cart,
} from "./portalModel";

function product(id: number, name: string, category: string, unit: PortalProduct["unit"], price: number, inStock = true): PortalProduct {
  return { id, name, category, unit, price, in_stock: inStock };
}

const RICE = product(1, "Basmati Rice", "Staples", "kg", 110);
const OIL = product(2, "Sunflower Oil 1 L", "Oils & Ghee", "pcs", 155);
const MUSTARD = product(3, "Mustard Seeds 100 g", "Spices", "pack", 20, false);
const SOAP = product(4, "Bath Soap", "", "pcs", 38.5);
const PRODUCTS = [OIL, RICE, MUSTARD, SOAP];

describe("units", () => {
  it("steps whole packets, half kilos and 50 g", () => {
    expect(quantityStep("pcs")).toBe(1);
    expect(quantityStep("kg")).toBe(0.25);
    expect(quantityStep("ml")).toBe(50);
    expect(quantityStep("bundle")).toBe(1);
    expect(firstQuantity("kg")).toBe(1);
    expect(firstQuantity("g")).toBe(100);
    expect(perUnit("pcs")).toBe("pc");
    expect(perUnit("l")).toBe("L");
    expect(priceSuffix("pcs")).toBe(" each");
    expect(priceSuffix("kg")).toBe(" / kg");
  });
});

describe("cart", () => {
  it("adds in order, updates, and removes at zero", () => {
    let cart: Cart = [];
    cart = setCartQuantity(cart, RICE.id, 1);
    cart = setCartQuantity(cart, OIL.id, 2);
    cart = setCartQuantity(cart, RICE.id, 1.5);
    expect(cart).toEqual([
      { productId: RICE.id, quantity: 1.5 },
      { productId: OIL.id, quantity: 2 },
    ]);
    expect(setCartQuantity(cart, RICE.id, 0)).toEqual([{ productId: OIL.id, quantity: 2 }]);
  });

  it("keeps a zero line while the customer is retyping", () => {
    const cart = setCartQuantity([{ productId: RICE.id, quantity: 2 }], RICE.id, 0, true);
    expect(cart).toEqual([{ productId: RICE.id, quantity: 0 }]);
    expect(cartLines(cart, PRODUCTS)).toEqual([]);
  });

  it("returns the same cart when nothing changes", () => {
    const cart: Cart = [{ productId: RICE.id, quantity: 2 }];
    expect(setCartQuantity(cart, RICE.id, 2)).toBe(cart);
    expect(setCartQuantity(cart, OIL.id, 0)).toBe(cart);
  });

  it("totals in paise and skips products that can't be ordered", () => {
    const cart: Cart = [
      { productId: RICE.id, quantity: 1.5 },
      { productId: SOAP.id, quantity: 3 },
      { productId: MUSTARD.id, quantity: 1 },
      { productId: 99, quantity: 1 },
    ];
    const lines = cartLines(cart, PRODUCTS);
    expect(lines.map((line) => [line.product.id, line.total])).toEqual([
      [RICE.id, 165],
      [SOAP.id, 115.5],
    ]);
    expect(cartTotal(lines)).toBe(280.5);
    expect(pruneCart(cart, PRODUCTS)).toEqual([
      { productId: RICE.id, quantity: 1.5 },
      { productId: SOAP.id, quantity: 3 },
    ]);
  });

  it("reads a stored cart defensively", () => {
    expect(parseStoredCart(null)).toEqual([]);
    expect(parseStoredCart("not json")).toEqual([]);
    expect(parseStoredCart('{"1":2}')).toEqual([]);
    expect(
      parseStoredCart(
        JSON.stringify([
          { productId: 1, quantity: 2 },
          { productId: 1, quantity: 5 },
          { productId: "2", quantity: 1 },
          { productId: 3, quantity: -1 },
          { productId: 4, quantity: 5000 },
        ]),
      ),
    ).toEqual([
      { productId: 1, quantity: 2 },
      { productId: 4, quantity: 1000 },
    ]);
  });
});

describe("products", () => {
  it("groups by category A to Z with uncategorised last", () => {
    expect(groupProducts(PRODUCTS).map((group) => [group.category, group.products.map((item) => item.id)])).toEqual([
      ["Oils & Ghee", [OIL.id]],
      ["Spices", [MUSTARD.id]],
      ["Staples", [RICE.id]],
      ["Other", [SOAP.id]],
    ]);
  });

  it("matches every word of the search in name or category", () => {
    expect(filterProducts(PRODUCTS, "rice", null)).toEqual([RICE]);
    expect(filterProducts(PRODUCTS, "  oil   sun ", null)).toEqual([OIL]);
    expect(filterProducts(PRODUCTS, "staples basmati", null)).toEqual([RICE]);
    expect(filterProducts(PRODUCTS, "", "Spices")).toEqual([MUSTARD]);
    expect(filterProducts(PRODUCTS, "rice", "Spices")).toEqual([]);
    expect(filterProducts(PRODUCTS, "soap", "Other")).toEqual([SOAP]);
  });
});

describe("khata and orders", () => {
  it("shows the newest entries and orders first", () => {
    const entries = [{ id: "a" }, { id: "b" }, { id: "c" }] as LedgerEntry[];
    expect(newestEntriesFirst(entries).map((entry) => entry.id)).toEqual(["c", "b", "a"]);
    expect(entries.map((entry) => entry.id)).toEqual(["a", "b", "c"]);

    const orders = [
      { number: 1001, created_at: "2026-10-01T10:00:00+00:00" },
      { number: 1003, created_at: "2026-10-03T10:00:00+00:00" },
      { number: 1002, created_at: "2026-10-03T10:00:00+00:00" },
    ] as PortalOrder[];
    expect(newestOrdersFirst(orders).map((order) => order.number)).toEqual([1003, 1002, 1001]);
  });

  it("adds the city only when the address doesn't name it", () => {
    expect(shopAddress("Shop 4, Model Colony, Pune 411016", "Pune")).toBe("Shop 4, Model Colony, Pune 411016");
    expect(shopAddress("Shop 4, Model Colony", "Pune")).toBe("Shop 4, Model Colony, Pune");
    expect(shopAddress("", "Pune")).toBe("Pune");
    expect(shopAddress("Shop 4", "")).toBe("Shop 4");
  });
});
