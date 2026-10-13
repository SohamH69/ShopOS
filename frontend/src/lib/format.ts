// Display formatting for money, quantities, dates and people.
// Dates are always shown in IST (UTC+05:30, no DST) regardless of the device's time zone,
// so every staff member sees the same "today" as the backend.

import { roundQty, toPaise } from "./money";

export type DateInput = Date | string | number;

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const MINUS = "−";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ---------------------------------------------------------------------------
// Numbers and money
// ---------------------------------------------------------------------------

const numberFormats = new Map<string, Intl.NumberFormat>();

function numberFormat(minDecimals: number, maxDecimals: number): Intl.NumberFormat {
  const key = `${minDecimals}:${maxDecimals}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: minDecimals,
      maximumFractionDigits: maxDecimals,
    });
    numberFormats.set(key, format);
  }
  return format;
}

/** Indian digit grouping, trailing zeros trimmed: 123456.5 → "1,23,456.5". */
export function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return "0";
  const text = numberFormat(0, maxDecimals).format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `${MINUS}${text}` : text;
}

/** Whole-number count with Indian grouping: 1234 → "1,234". */
export function formatCount(value: number): string {
  return formatNumber(Math.round(value), 0);
}

/** "₹18,450" or "₹92.50". Decimals only when there are paise. Nullish → "–". */
export function formatMoney(value: number | null | undefined): string {
  if (value == null) return "–";
  const paise = toPaise(value);
  const absolute = Math.abs(paise);
  const decimals = absolute % 100 === 0 ? 0 : 2;
  const text = numberFormat(decimals, decimals).format(absolute / 100);
  return `${paise < 0 ? MINUS : ""}₹${text}`;
}

/** Always two decimals: "₹92.50", "₹18,450.00". Nullish → "–". */
export function formatMoneyExact(value: number | null | undefined): string {
  if (value == null) return "–";
  const paise = toPaise(value);
  const text = numberFormat(2, 2).format(Math.abs(paise) / 100);
  return `${paise < 0 ? MINUS : ""}₹${text}`;
}

/** Short Indian notation for chart axes and tight spots: "₹950", "₹12.5K", "₹1.2L", "₹3Cr". */
export function formatMoneyCompact(value: number): string {
  const paise = toPaise(value);
  const rupees = Math.abs(paise) / 100;
  const sign = paise < 0 ? MINUS : "";
  if (rupees >= 1e7) return `${sign}₹${formatNumber(rupees / 1e7, 1)}Cr`;
  if (rupees >= 1e5) return `${sign}₹${formatNumber(rupees / 1e5, 1)}L`;
  if (rupees >= 1e3) return `${sign}₹${formatNumber(rupees / 1e3, 1)}K`;
  return `${sign}₹${formatNumber(rupees, 2)}`;
}

/** "12%", or with decimals "12.5%". */
export function formatPercent(value: number, maxDecimals = 0): string {
  return `${formatNumber(value, maxDecimals)}%`;
}

export type ChangeDirection = "up" | "down" | "same";

export interface Change {
  direction: ChangeDirection;
  /** Rounded percentage change, or null when the previous value was zero. */
  percent: number | null;
  /** "12%", "<1%", or "" when there is no meaningful percentage. */
  text: string;
}

/** Compares two values for "↑ 12% vs yesterday" style hints. */
export function formatChange(current: number, previous: number): Change {
  if (toPaise(current) === toPaise(previous)) return { direction: "same", percent: 0, text: "" };
  const direction: ChangeDirection = current > previous ? "up" : "down";
  if (previous === 0) return { direction, percent: null, text: "" };
  const percent = Math.round((Math.abs(current - previous) / Math.abs(previous)) * 100);
  return { direction, percent, text: percent === 0 ? "<1%" : `${formatCount(percent)}%` };
}

// ---------------------------------------------------------------------------
// Quantities
// ---------------------------------------------------------------------------

const UNIT_FORMS: Record<string, readonly [singular: string, plural: string]> = {
  pcs: ["pc", "pcs"],
  kg: ["kg", "kg"],
  g: ["g", "g"],
  l: ["L", "L"],
  ml: ["ml", "ml"],
  pack: ["pack", "packs"],
  dozen: ["dozen", "dozen"],
  box: ["box", "boxes"],
};

/** "5 kg", "2.5 kg", "1 pc", "12 pcs", "2 packs". Unknown units are printed as given. */
export function formatQty(quantity: number, unit?: string | null): string {
  const rounded = roundQty(quantity);
  const number = formatNumber(rounded, 3);
  if (!unit) return number;
  const forms = UNIT_FORMS[unit];
  if (!forms) return `${number} ${unit}`;
  return `${number} ${Math.abs(rounded) === 1 ? forms[0] : forms[1]}`;
}

export interface SummaryItem {
  name: string;
  quantity: number;
  unit: string;
}

/** "5 kg Basmati rice, 1 Tea powder +2 more". Pieces are counted without a unit. */
export function formatItemsSummary(items: readonly SummaryItem[], max = 2): string {
  if (items.length === 0) return "No items";
  const shown = items.slice(0, max).map((item) => {
    const quantity = item.unit === "pcs" ? formatNumber(roundQty(item.quantity), 3) : formatQty(item.quantity, item.unit);
    return `${quantity} ${item.name}`;
  });
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(", ")} +${rest} more` : shown.join(", ");
}

// ---------------------------------------------------------------------------
// Dates and times (IST)
// ---------------------------------------------------------------------------

interface ISTParts {
  year: number;
  month: number; // 0-11
  day: number;
  weekday: number; // 0 = Sunday
  hours: number;
  minutes: number;
}

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function istParts(value: DateInput): ISTParts | null {
  const time = toDate(value).getTime();
  if (Number.isNaN(time)) return null;
  const shifted = new Date(time + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

/** Calendar day number in IST, for "yesterday"/"tomorrow" comparisons. */
function istDayNumber(time: number): number {
  return Math.floor((time + IST_OFFSET_MS) / DAY_MS);
}

function currentISTYear(now: DateInput | undefined): number {
  return istParts(now ?? Date.now())?.year ?? new Date().getUTCFullYear();
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function isBlank(value: DateInput | null | undefined): value is null | undefined | "" {
  return value == null || value === "";
}

export interface FormatDateOptions {
  /** "auto" (default) shows the year only when it isn't the current year. */
  year?: "auto" | "always" | "never";
  now?: DateInput;
}

/** "4 Oct" (this year) or "4 Oct 2025". Accepts ISO datetimes and "YYYY-MM-DD" dates. */
export function formatDate(value: DateInput | null | undefined, options: FormatDateOptions = {}): string {
  if (isBlank(value)) return "–";
  const parts = istParts(value);
  if (!parts) return "–";
  const year = options.year ?? "auto";
  const showYear = year === "always" || (year === "auto" && parts.year !== currentISTYear(options.now));
  return `${parts.day} ${MONTHS_SHORT[parts.month]}${showYear ? ` ${parts.year}` : ""}`;
}

/** "Saturday, 4 October" (year added when it isn't the current year). */
export function formatDateLong(value: DateInput | null | undefined, options: FormatDateOptions = {}): string {
  if (isBlank(value)) return "–";
  const parts = istParts(value);
  if (!parts) return "–";
  const year = options.year ?? "auto";
  const showYear = year === "always" || (year === "auto" && parts.year !== currentISTYear(options.now));
  return `${WEEKDAYS[parts.weekday]}, ${parts.day} ${MONTHS_LONG[parts.month]}${showYear ? ` ${parts.year}` : ""}`;
}

/** "6:30 pm". */
export function formatTime(value: DateInput | null | undefined): string {
  if (isBlank(value)) return "–";
  const parts = istParts(value);
  if (!parts) return "–";
  const hours12 = parts.hours % 12 === 0 ? 12 : parts.hours % 12;
  return `${hours12}:${pad2(parts.minutes)} ${parts.hours < 12 ? "am" : "pm"}`;
}

/** "4 Oct, 6:30 pm". */
export function formatDateTime(value: DateInput | null | undefined, options: FormatDateOptions = {}): string {
  if (isBlank(value)) return "–";
  if (!istParts(value)) return "–";
  return `${formatDate(value, options)}, ${formatTime(value)}`;
}

/** "40 min", "2h", "1h 20m", "3 days". */
export function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(1, Math.round(Math.abs(milliseconds) / MINUTE_MS));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day" : `${days} days`;
}

/** "just now", "5 min ago", "2h ago", "yesterday", "3 days ago", "in 30 min", "tomorrow", then a date. */
export function formatRelative(value: DateInput | null | undefined, now: DateInput = Date.now()): string {
  if (isBlank(value)) return "–";
  const target = toDate(value).getTime();
  if (Number.isNaN(target)) return "–";
  const nowTime = toDate(now).getTime();
  const difference = target - nowTime;
  const future = difference > 0;
  const absolute = Math.abs(difference);

  if (absolute < 45_000) return "just now";
  const minutes = Math.round(absolute / MINUTE_MS);
  if (minutes < 60) return future ? `in ${minutes} min` : `${minutes} min ago`;
  const hours = Math.round(absolute / HOUR_MS);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;

  const dayDifference = istDayNumber(target) - istDayNumber(nowTime);
  if (dayDifference === -1) return "yesterday";
  if (dayDifference === 1) return "tomorrow";
  if (Math.abs(dayDifference) < 7) {
    return future ? `in ${dayDifference} days` : `${-dayDifference} days ago`;
  }
  return formatDate(target, { now: nowTime });
}

export interface DueInfo {
  text: string;
  overdue: boolean;
}

/** "Due 6:30 pm", "Due tomorrow, 10:00 am", "Due 12 Oct, 7:00 pm" or "Overdue by 40 min". Null when there is no due time. */
export function formatDue(dueAt: DateInput | null | undefined, now: DateInput = Date.now()): DueInfo | null {
  if (isBlank(dueAt)) return null;
  const target = toDate(dueAt).getTime();
  if (Number.isNaN(target)) return null;
  const nowTime = toDate(now).getTime();
  if (target < nowTime) return { text: `Overdue by ${formatDuration(nowTime - target)}`, overdue: true };
  const dayDifference = istDayNumber(target) - istDayNumber(nowTime);
  const time = formatTime(target);
  if (dayDifference === 0) return { text: `Due ${time}`, overdue: false };
  if (dayDifference === 1) return { text: `Due tomorrow, ${time}`, overdue: false };
  return { text: `Due ${formatDate(target, { now: nowTime })}, ${time}`, overdue: false };
}

/** The IST calendar date of a moment, as "YYYY-MM-DD". */
export function toISODate(value: DateInput): string {
  const parts = istParts(value);
  if (!parts) return "";
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}`;
}

/** Today's date in IST, as "YYYY-MM-DD". */
export function todayISO(now: DateInput = Date.now()): string {
  return toISODate(now);
}

/** Calendar arithmetic on "YYYY-MM-DD" strings. */
export function addDaysISO(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export type DatePreset = "today" | "yesterday" | "7d" | "30d" | "90d" | "this_month" | "last_month" | "all";

export interface DateRange {
  date_from?: string;
  date_to?: string;
}

/** Inclusive IST date range for a preset, ready to spread into API filters. "all" → {}. */
export function dateRange(preset: DatePreset, now: DateInput = Date.now()): DateRange {
  const today = todayISO(now);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  switch (preset) {
    case "today":
      return { date_from: today, date_to: today };
    case "yesterday": {
      const yesterday = addDaysISO(today, -1);
      return { date_from: yesterday, date_to: yesterday };
    }
    case "7d":
      return { date_from: addDaysISO(today, -6), date_to: today };
    case "30d":
      return { date_from: addDaysISO(today, -29), date_to: today };
    case "90d":
      return { date_from: addDaysISO(today, -89), date_to: today };
    case "this_month":
      return { date_from: firstOfMonth, date_to: today };
    case "last_month": {
      const lastOfPrevious = addDaysISO(firstOfMonth, -1);
      return { date_from: `${lastOfPrevious.slice(0, 8)}01`, date_to: lastOfPrevious };
    }
    case "all":
      return {};
  }
}

/** ISO datetime for a wall-clock time in IST: istDateTime("2026-10-04", 19) → "2026-10-04T19:00:00+05:30". */
export function istDateTime(isoDate: string, hours: number, minutes = 0): string {
  return `${isoDate}T${pad2(hours)}:${pad2(minutes)}:00+05:30`;
}

/** Value for <input type="datetime-local"> showing the moment in IST ("2026-10-04T18:30"). */
export function toDateTimeInputValue(value: DateInput | null | undefined): string {
  if (isBlank(value)) return "";
  const parts = istParts(value);
  if (!parts) return "";
  return `${parts.year}-${pad2(parts.month + 1)}-${pad2(parts.day)}T${pad2(parts.hours)}:${pad2(parts.minutes)}`;
}

/** Reads a datetime-local value as IST and returns an ISO string with offset, or null if empty/invalid. */
export function fromDateTimeInputValue(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+05:30`;
}

// ---------------------------------------------------------------------------
// People, phones, orders
// ---------------------------------------------------------------------------

/** Only the digits of a phone number. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Digits with country code for links ("919876543210"). Indian 10-digit numbers get 91. */
export function internationalDigits(phone: string): string {
  let digits = phoneDigits(phone);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/** "98765 43210" or "+91 98765 43210"; anything unusual is returned trimmed. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phoneDigits(phone);
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `${digits.slice(1, 6)} ${digits.slice(6)}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone.trim();
}

/** "tel:+919876543210" for click-to-call links. */
export function telHref(phone: string): string {
  const digits = internationalDigits(phone);
  return digits ? `tel:+${digits}` : "tel:";
}

/** "#1045". */
export function orderNo(number: number | null | undefined): string {
  return number == null ? "–" : `#${number}`;
}

/** "1 order", "3 orders", "1,204 customers". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

/** "Raj Deshmukh" → "RD", "Meera" → "M". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toUpperCase();
}

/** "Rahul Sharma" → "Rahul". */
export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}
