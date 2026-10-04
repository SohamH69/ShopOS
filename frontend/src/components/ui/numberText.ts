// Text <-> number helpers for the decimal inputs (MoneyInput, QuantityInput).
// Inputs keep the raw text while typing ("12.", "0.2") and report parsed numbers upward.

/** Keeps digits and a single dot, limits decimals and strips leading zeros ("007.505" → "7.50"). */
export function sanitizeDecimal(raw: string, maxDecimals: number): string {
  let cleaned = raw.replace(/[^\d.]/g, "");
  if (maxDecimals <= 0) {
    cleaned = cleaned.replace(/\./g, "");
  } else {
    const dot = cleaned.indexOf(".");
    if (dot !== -1) {
      cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals);
    }
  }
  return cleaned.replace(/^0+(?=\d)/, "");
}

/** Parses sanitized text; empty or a lone dot is null. */
export function parseDecimal(text: string): number | null {
  if (text === "" || text === ".") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
