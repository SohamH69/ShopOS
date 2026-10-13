import { roundMoney } from "./money";

export interface UpiPaymentOptions {
  upiId: string;
  payeeName: string;
  /** Rupees. Omitted (or ≤ 0) lets the customer type the amount. */
  amount?: number | null;
  /** Transaction note shown in the customer's UPI app, e.g. "Order 1045". */
  note?: string;
}

/**
 * `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=…`. Encode this in a QR code so any UPI app can pay.
 * Spaces are %20-encoded (several UPI apps mis-read "+") and the "@" of the VPA is kept literal.
 */
export function upiPaymentUri({ upiId, payeeName, amount, note }: UpiPaymentOptions): string {
  const parts = [
    `pa=${encodeURIComponent(upiId.trim()).replace(/%40/g, "@")}`,
    `pn=${encodeURIComponent(payeeName.trim())}`,
  ];
  if (amount != null && amount > 0) parts.push(`am=${roundMoney(amount).toFixed(2)}`);
  parts.push("cu=INR");
  if (note) parts.push(`tn=${encodeURIComponent(note)}`);
  return `upi://pay?${parts.join("&")}`;
}
