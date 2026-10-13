import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  dateRange,
  firstName,
  formatChange,
  formatCount,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatDue,
  formatDuration,
  formatItemsSummary,
  formatMoney,
  formatMoneyCompact,
  formatMoneyExact,
  formatNumber,
  formatPercent,
  formatPhone,
  formatQty,
  formatRelative,
  formatTime,
  fromDateTimeInputValue,
  initials,
  internationalDigits,
  istDateTime,
  orderNo,
  pluralize,
  telHref,
  toDateTimeInputValue,
  toISODate,
  todayISO,
} from "./format";

const MINUS = "−";
// 4 Oct 2026, 3:30 pm IST (a Sunday).
const NOW = "2026-10-04T10:00:00+00:00";

describe("formatMoney", () => {
  it("drops decimals for whole rupees and uses Indian grouping", () => {
    expect(formatMoney(18450)).toBe("₹18,450");
    expect(formatMoney(123456)).toBe("₹1,23,456");
    expect(formatMoney(0)).toBe("₹0");
  });

  it("shows two decimals only when there are paise", () => {
    expect(formatMoney(92.5)).toBe("₹92.50");
    expect(formatMoney(123456.75)).toBe("₹1,23,456.75");
  });

  it("rounds half-up to the paise", () => {
    expect(formatMoney(1.005)).toBe("₹1.01");
    expect(formatMoney(99.999)).toBe("₹100");
  });

  it("uses a true minus sign and a dash for missing values", () => {
    expect(formatMoney(-500)).toBe(`${MINUS}₹500`);
    expect(formatMoney(null)).toBe("–");
    expect(formatMoney(undefined)).toBe("–");
  });
});

describe("formatMoneyExact and formatMoneyCompact", () => {
  it("always prints two decimals", () => {
    expect(formatMoneyExact(92.5)).toBe("₹92.50");
    expect(formatMoneyExact(18450)).toBe("₹18,450.00");
    expect(formatMoneyExact(-3)).toBe(`${MINUS}₹3.00`);
  });

  it("uses K, L and Cr for large amounts", () => {
    expect(formatMoneyCompact(950)).toBe("₹950");
    expect(formatMoneyCompact(12500)).toBe("₹12.5K");
    expect(formatMoneyCompact(150000)).toBe("₹1.5L");
    expect(formatMoneyCompact(30000000)).toBe("₹3Cr");
  });
});

describe("numbers", () => {
  it("formats with Indian grouping and trims zeros", () => {
    expect(formatNumber(1234567.891)).toBe("12,34,567.89");
    expect(formatNumber(2.5, 3)).toBe("2.5");
    expect(formatNumber(-0.0001)).toBe("0");
    expect(formatCount(1204.4)).toBe("1,204");
    expect(formatPercent(12.5, 1)).toBe("12.5%");
  });

  it("describes change against a previous value", () => {
    expect(formatChange(112, 100)).toEqual({ direction: "up", percent: 12, text: "12%" });
    expect(formatChange(95, 100)).toEqual({ direction: "down", percent: 5, text: "5%" });
    expect(formatChange(100, 100)).toEqual({ direction: "same", percent: 0, text: "" });
    expect(formatChange(50, 0)).toEqual({ direction: "up", percent: null, text: "" });
    expect(formatChange(100.4, 100).text).toBe("<1%");
  });
});

describe("formatQty", () => {
  it("prints the unit with singular and plural forms", () => {
    expect(formatQty(5, "kg")).toBe("5 kg");
    expect(formatQty(2.5, "kg")).toBe("2.5 kg");
    expect(formatQty(1, "pcs")).toBe("1 pc");
    expect(formatQty(12, "pcs")).toBe("12 pcs");
    expect(formatQty(2, "pack")).toBe("2 packs");
    expect(formatQty(1, "l")).toBe("1 L");
    expect(formatQty(1500, "g")).toBe("1,500 g");
  });

  it("rounds to three decimals and passes unknown units through", () => {
    expect(formatQty(0.1255, "kg")).toBe("0.126 kg");
    expect(formatQty(3, "bunch")).toBe("3 bunch");
    expect(formatQty(4)).toBe("4");
  });

  it("summarises order items", () => {
    const items = [
      { name: "Basmati rice", quantity: 5, unit: "kg" },
      { name: "Tea powder", quantity: 1, unit: "pcs" },
      { name: "Sugar", quantity: 2, unit: "kg" },
      { name: "Ghee", quantity: 1, unit: "l" },
    ];
    expect(formatItemsSummary(items)).toBe("5 kg Basmati rice, 1 Tea powder +2 more");
    expect(formatItemsSummary(items.slice(0, 2))).toBe("5 kg Basmati rice, 1 Tea powder");
    expect(formatItemsSummary([])).toBe("No items");
  });
});

describe("dates in IST", () => {
  it("formats dates, adding the year only when it differs", () => {
    expect(formatDate("2026-10-04T09:30:00+00:00", { now: NOW })).toBe("4 Oct");
    expect(formatDate("2025-08-20T09:30:00+00:00", { now: NOW })).toBe("20 Aug 2025");
    expect(formatDate("2026-10-04", { now: NOW, year: "always" })).toBe("4 Oct 2026");
    expect(formatDate(null)).toBe("–");
    expect(formatDate("not a date")).toBe("–");
  });

  it("uses the IST calendar day, not UTC", () => {
    // 19:00 UTC on 3 Oct is 00:30 IST on 4 Oct.
    expect(formatDate("2026-10-03T19:00:00+00:00", { now: NOW })).toBe("4 Oct");
    expect(toISODate("2026-10-03T19:00:00+00:00")).toBe("2026-10-04");
    expect(todayISO("2026-10-03T20:00:00Z")).toBe("2026-10-04");
  });

  it("formats times with lowercase am/pm", () => {
    expect(formatTime("2026-10-04T13:00:00+00:00")).toBe("6:30 pm");
    expect(formatTime("2026-10-03T18:30:00Z")).toBe("12:00 am");
    expect(formatTime("2026-10-04T06:30:00Z")).toBe("12:00 pm");
    expect(formatDateTime("2026-10-04T13:00:00+00:00", { now: NOW })).toBe("4 Oct, 6:30 pm");
  });

  it("formats long dates", () => {
    expect(formatDateLong("2026-10-04T06:30:00Z", { now: NOW })).toBe("Sunday, 4 October");
  });

  it("formats relative times", () => {
    expect(formatRelative("2026-10-04T09:59:40Z", NOW)).toBe("just now");
    expect(formatRelative("2026-10-04T09:55:00Z", NOW)).toBe("5 min ago");
    expect(formatRelative("2026-10-04T08:00:00Z", NOW)).toBe("2h ago");
    expect(formatRelative("2026-10-04T10:30:00Z", NOW)).toBe("in 30 min");
    expect(formatRelative("2026-10-03T08:00:00Z", NOW)).toBe("yesterday");
    expect(formatRelative("2026-10-05T12:00:00Z", NOW)).toBe("tomorrow");
    expect(formatRelative("2026-10-01T08:00:00Z", NOW)).toBe("3 days ago");
    expect(formatRelative("2026-09-24T08:00:00Z", NOW)).toBe("24 Sep");
  });

  it("formats durations and due times", () => {
    expect(formatDuration(40 * 60_000)).toBe("40 min");
    expect(formatDuration(80 * 60_000)).toBe("1h 20m");
    expect(formatDuration(120 * 60_000)).toBe("2h");
    expect(formatDuration(30 * 3_600_000)).toBe("1 day");
    expect(formatDue("2026-10-04T09:20:00Z", NOW)).toEqual({ text: "Overdue by 40 min", overdue: true });
    expect(formatDue("2026-10-04T13:00:00Z", NOW)).toEqual({ text: "Due 6:30 pm", overdue: false });
    expect(formatDue("2026-10-05T04:30:00Z", NOW)).toEqual({ text: "Due tomorrow, 10:00 am", overdue: false });
    expect(formatDue(null, NOW)).toBeNull();
  });

  it("does calendar arithmetic and date ranges", () => {
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysISO("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDaysISO("2026-12-31", 1)).toBe("2027-01-01");
    expect(dateRange("today", NOW)).toEqual({ date_from: "2026-10-04", date_to: "2026-10-04" });
    expect(dateRange("7d", NOW)).toEqual({ date_from: "2026-09-28", date_to: "2026-10-04" });
    expect(dateRange("30d", NOW)).toEqual({ date_from: "2026-09-05", date_to: "2026-10-04" });
    expect(dateRange("this_month", NOW)).toEqual({ date_from: "2026-10-01", date_to: "2026-10-04" });
    expect(dateRange("last_month", NOW)).toEqual({ date_from: "2026-09-01", date_to: "2026-09-30" });
    expect(dateRange("all", NOW)).toEqual({});
  });

  it("converts datetime-local values as IST", () => {
    expect(toDateTimeInputValue("2026-10-04T13:00:00Z")).toBe("2026-10-04T18:30");
    expect(fromDateTimeInputValue("2026-10-04T18:30")).toBe("2026-10-04T18:30:00+05:30");
    expect(fromDateTimeInputValue("")).toBeNull();
    expect(istDateTime("2026-10-04", 19)).toBe("2026-10-04T19:00:00+05:30");
  });
});

describe("people and orders", () => {
  it("formats Indian phone numbers", () => {
    expect(formatPhone("9876543210")).toBe("98765 43210");
    expect(formatPhone("+91 98765 00001")).toBe("+91 98765 00001");
    expect(formatPhone("09876543210")).toBe("98765 43210");
    expect(formatPhone("12345")).toBe("12345");
    expect(formatPhone(null)).toBe("");
  });

  it("builds international digits and tel links", () => {
    expect(internationalDigits("98765 43210")).toBe("919876543210");
    expect(internationalDigits("+91 98765 00001")).toBe("919876500001");
    expect(internationalDigits("0091 98765 00001")).toBe("919876500001");
    expect(telHref("98765 43210")).toBe("tel:+919876543210");
  });

  it("formats order numbers, counts and names", () => {
    expect(orderNo(1045)).toBe("#1045");
    expect(orderNo(null)).toBe("–");
    expect(pluralize(1, "order")).toBe("1 order");
    expect(pluralize(3, "order")).toBe("3 orders");
    expect(pluralize(2, "box", "boxes")).toBe("2 boxes");
    expect(initials("Raj Deshmukh")).toBe("RD");
    expect(initials("meera")).toBe("M");
    expect(initials("Sunita  Joshi Patil")).toBe("SP");
    expect(initials("")).toBe("?");
    expect(firstName("Rahul Sharma")).toBe("Rahul");
    expect(firstName(null)).toBe("");
  });
});
