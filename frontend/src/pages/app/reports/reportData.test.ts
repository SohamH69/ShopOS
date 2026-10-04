import { describe, expect, it } from "vitest";
import type { Report, SeriesPoint } from "../../../lib/types";
import {
  averageOrder,
  axisLabel,
  bestPoint,
  chartData,
  comparisonLabel,
  hasNoSales,
  parseRange,
  percentOf,
  profitText,
  quantityText,
  salesCaption,
  salesSummary,
  shareText,
  unitLookup,
} from "./reportData";

function point(start: string, label: string, sales: number, orders: number): SeriesPoint {
  return { start, label, sales, orders };
}

const EMPTY_INVENTORY: Report["inventory"] = { fast_moving: [], slow_moving: [], low_stock: [] };

describe("parseRange", () => {
  it("accepts known ranges and falls back to 30 days", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("12m")).toBe("12m");
    expect(parseRange("")).toBe("30d");
    expect(parseRange(null)).toBe("30d");
    expect(parseRange("1y")).toBe("30d");
  });

  it("names the comparison period", () => {
    expect(comparisonLabel("7d")).toBe("previous 7 days");
    expect(comparisonLabel("12m")).toBe("previous 12 months");
  });
});

describe("axisLabel", () => {
  it("keeps day labels, shortens weeks and months", () => {
    expect(axisLabel(point("2026-10-04", "4 Oct", 0, 0), "day")).toBe("4 Oct");
    expect(axisLabel(point("2026-09-29", "Week of 29 Sep", 0, 0), "week")).toBe("29 Sep");
    expect(axisLabel(point("2025-12-01", "Week of 1 Dec", 0, 0), "week")).toBe("1 Dec");
    expect(axisLabel(point("2026-10-01", "Oct 2026", 0, 0), "month")).toBe("Oct");
    expect(axisLabel(point("2025-11-01", "Nov 2025", 0, 0), "month")).toBe("Nov");
  });
});

describe("chartData", () => {
  it("highlights only the latest bucket and carries the order count", () => {
    const data = chartData({
      bucket: "day",
      series: [point("2026-10-03", "3 Oct", 1200, 4), point("2026-10-04", "4 Oct", 800, 1)],
    });
    expect(data.map((datum) => datum.highlight)).toEqual([false, true]);
    expect(data[0].secondary).toBe("4 orders");
    expect(data[1].secondary).toBe("1 order");
  });

  it("handles an empty series", () => {
    expect(chartData({ bucket: "day", series: [] })).toEqual([]);
  });
});

describe("best bucket and captions", () => {
  const series = [point("2026-09-29", "Week of 29 Sep", 62000, 120), point("2026-10-06", "Week of 6 Oct", 15000, 30)];

  it("finds the best bucket and ignores zero sales", () => {
    expect(bestPoint(series)?.start).toBe("2026-09-29");
    expect(bestPoint([point("2026-10-04", "4 Oct", 0, 0)])).toBeNull();
  });

  it("writes a caption per bucket", () => {
    expect(salesCaption({ bucket: "week", series })).toBe("Weekly sales (Monday to Sunday) · best: week of 29 Sep, ₹62,000");
    expect(salesCaption({ bucket: "day", series: [point("2026-09-27", "27 Sep", 14200, 30)] })).toBe(
      "Daily sales · best: 27 Sep, ₹14,200",
    );
    expect(salesCaption({ bucket: "month", series: [point("2026-08-01", "Aug 2026", 240000, 610)] })).toBe(
      "Monthly sales · best: Aug 2026, ₹2,40,000",
    );
    expect(salesCaption({ bucket: "month", series: [] })).toBe("Monthly sales");
  });

  it("names weeks by their start in the summary", () => {
    const totals: Report["totals"] = { sales: 77000, orders: 150, avg_order_value: 513.33, gross_profit: 0, payments_received: 0, expenses: 0, net_profit: 0 };
    expect(salesSummary({ bucket: "week", range: "90d", series, totals })).toBe(
      "Sales by week, last 90 days: ₹77,000 from 150 orders. Best week: starting 29 Sep, ₹62,000.",
    );
  });

  it("summarises the chart for screen readers", () => {
    const summary = salesSummary({
      bucket: "day",
      range: "30d",
      series: [point("2026-09-27", "27 Sep", 14200, 30)],
      totals: { sales: 245600, orders: 412, avg_order_value: 596, gross_profit: 0, payments_received: 0, expenses: 0, net_profit: 0 },
    });
    expect(summary).toBe("Sales by day, last 30 days: ₹2,45,600 from 412 orders. Best day: 27 Sep, ₹14,200.");
  });
});

describe("safe arithmetic", () => {
  it("never divides by zero", () => {
    expect(percentOf(10, 0)).toBeNull();
    expect(percentOf(Number.NaN, 10)).toBeNull();
    expect(percentOf(25, 100)).toBe(25);
    expect(shareText(1, 0)).toBeNull();
    expect(shareText(1, 1000)).toBe("<1%");
    expect(shareText(339, 1000)).toBe("34%");
    expect(shareText(0, 1000)).toBe("0%");
    expect(averageOrder(1000, 0)).toBe(0);
    expect(averageOrder(1000, 3)).toBe(333.33);
  });

  it("detects a period without sales", () => {
    const totals: Report["totals"] = { sales: 0, orders: 0, avg_order_value: 0, gross_profit: 0, payments_received: 0, expenses: 0, net_profit: 0 };
    expect(hasNoSales({ totals, series: [point("2026-10-04", "4 Oct", 0, 0)] })).toBe(true);
    expect(hasNoSales({ totals: { ...totals, sales: 10 }, series: [] })).toBe(false);
  });
});

describe("units and quantities", () => {
  it("merges units from products and the report", () => {
    const units = unitLookup(
      {
        inventory: {
          ...EMPTY_INVENTORY,
          fast_moving: [{ product_id: 2, name: "Sugar", unit: "kg", quantity: 12, stock_quantity: 30 }],
        },
      },
      [{ id: 1, unit: "pcs" }],
    );
    expect(units.get(1)).toBe("pcs");
    expect(units.get(2)).toBe("kg");
    expect(units.get(3)).toBeUndefined();
  });

  it("formats quantities with or without a unit", () => {
    expect(quantityText(2.5, "kg")).toBe("2.5 kg");
    expect(quantityText(12, undefined)).toBe("12");
    expect(profitText(340)).toBe("₹340 profit");
    expect(profitText(-40)).toBe("₹40 loss");
  });
});
