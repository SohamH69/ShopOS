import { describe, expect, it } from "vitest";
import { fromPaise, lineTotal, orderTotals, roundMoney, roundQty, sumMoney, toPaise } from "./money";

describe("money", () => {
  it("converts to paise rounding half-up despite float error", () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(0.285)).toBe(29);
    expect(toPaise(18450)).toBe(1845000);
    expect(toPaise(-2.675)).toBe(-268);
    expect(fromPaise(101)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
  });

  it("adds amounts without drift", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([])).toBe(0);
  });

  it("rounds quantities to three decimals", () => {
    expect(roundQty(0.0005)).toBe(0.001);
    expect(roundQty(2.4999)).toBe(2.5);
    expect(roundQty(-1.2345)).toBe(-1.235);
  });

  it("computes line totals like the backend", () => {
    expect(lineTotal(2.5, 46.35)).toBe(115.88);
    expect(lineTotal(3, 10, 5)).toBe(25);
    expect(lineTotal(0.25, 92)).toBe(23);
  });

  it("computes order totals", () => {
    const lines = [
      { quantity: 5, unit_price: 92 },
      { quantity: 1, unit_price: 198, discount: 8 },
    ];
    expect(orderTotals(lines)).toEqual({ subtotal: 650, discount: 0, total: 650 });
    expect(orderTotals(lines, 50)).toEqual({ subtotal: 650, discount: 50, total: 600 });
  });
});
