// WhatsApp click-to-chat links and the four messages a shop sends most.
// Messages are plain text (WhatsApp renders *bold*), short, and signed with the shop name.

import { firstName, formatDate, formatMoney, formatNumber, formatPhone, formatQty, formatTime, internationalDigits, orderNo, toISODate, todayISO } from "./format";
import { roundQty } from "./money";
import type { Customer, Order, Shop } from "./types";

export type ShopInfo = Pick<Shop, "name" | "phone" | "address" | "upi_id">;
export type MessageOrder = Pick<
  Order,
  | "number"
  | "customer_name"
  | "fulfillment"
  | "due_at"
  | "delivery_address"
  | "items"
  | "discount"
  | "total"
  | "paid"
  | "outstanding"
  | "created_at"
>;
export type MessageCustomer = Pick<Customer, "name" | "outstanding">;

/** True when the number has enough digits to open a WhatsApp chat. */
export function hasWhatsAppNumber(phone: string | null | undefined): boolean {
  return Boolean(phone) && internationalDigits(phone ?? "").length >= 10;
}

/**
 * `https://wa.me/<digits>?text=…` with the Indian country code added to 10-digit numbers.
 * Without a usable number the link opens WhatsApp's contact picker with the text ready.
 */
export function waLink(phone: string | null | undefined, text: string): string {
  const digits = phone ? internationalDigits(phone) : "";
  const query = `text=${encodeURIComponent(text)}`;
  return digits.length >= 10 ? `https://wa.me/${digits}?${query}` : `https://wa.me/?${query}`;
}

function greeting(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? `Namaste ${first}` : "Namaste";
}

function signature(shop: ShopInfo): string {
  const phone = formatPhone(shop.phone);
  return phone ? `${shop.name}, ${phone}` : shop.name;
}

function itemLine(item: MessageOrder["items"][number]): string {
  const quantity = item.unit === "pcs" ? `${formatNumber(roundQty(item.quantity), 3)} ×` : formatQty(item.quantity, item.unit);
  return `${quantity} ${item.name}: ${formatMoney(item.line_total)}`;
}

function dueWhen(dueAt: string): string {
  const sameDay = toISODate(dueAt) === todayISO();
  return sameDay ? formatTime(dueAt) : `${formatDate(dueAt)}, ${formatTime(dueAt)}`;
}

function amountLines(order: MessageOrder): string[] {
  const lines: string[] = [];
  if (order.discount > 0) lines.push(`Discount: ${formatMoney(-order.discount)}`);
  lines.push(`*Total: ${formatMoney(order.total)}*`);
  if (order.outstanding <= 0) {
    lines.push("Paid in full. Thank you!");
  } else if (order.paid > 0) {
    lines.push(`Paid: ${formatMoney(order.paid)}`, `Due: ${formatMoney(order.outstanding)}`);
  } else {
    lines.push(`To pay: ${formatMoney(order.outstanding)}`);
  }
  return lines;
}

/** Sent when an order is taken: items, total, what's due and when it will be ready. */
export function orderConfirmationMessage(order: MessageOrder, shop: ShopInfo): string {
  const lines = [
    `${greeting(order.customer_name)},`,
    `your order ${orderNo(order.number)} at ${shop.name} is confirmed.`,
    "",
    ...order.items.map(itemLine),
    "",
    ...amountLines(order),
    "",
  ];
  if (order.fulfillment === "delivery") {
    const when = order.due_at ? ` by ${dueWhen(order.due_at)}` : " soon";
    lines.push(
      order.delivery_address
        ? `We'll deliver it${when} to: ${order.delivery_address}`
        : `We'll deliver it${when}.`,
    );
  } else {
    lines.push(
      order.due_at
        ? `We'll keep it ready for pickup by ${dueWhen(order.due_at)}.`
        : "We'll message you when it's ready for pickup.",
    );
  }
  lines.push(signature(shop));
  return lines.join("\n");
}

/** Sent when the order is packed: pickup → "ready for pickup"; delivery → "on its way soon". */
export function pickupReadyMessage(order: MessageOrder, shop: ShopInfo): string {
  const lines: string[] = [];
  if (order.fulfillment === "delivery") {
    lines.push(`${greeting(order.customer_name)}, your order ${orderNo(order.number)} from ${shop.name} is ready and will be delivered soon.`);
    if (order.outstanding > 0) lines.push(`Please keep ${formatMoney(order.outstanding)} ready.`);
  } else {
    lines.push(`${greeting(order.customer_name)}, your order ${orderNo(order.number)} is ready for pickup at ${shop.name}.`);
    lines.push(order.outstanding > 0 ? `Amount to pay: ${formatMoney(order.outstanding)}.` : "It's fully paid.");
    if (shop.address) lines.push(`Address: ${shop.address}`);
  }
  lines.push(signature(shop));
  return lines.join("\n");
}

/**
 * A polite khata reminder: "Namaste Rahul, ₹1,250 is pending on your account at Raj Local Mart."
 * With `khataUrl`, the customer's khata link goes in too, so they can check the details and pay.
 */
export function paymentReminderMessage(customer: MessageCustomer, shop: ShopInfo, khataUrl?: string): string {
  const lines = [`${greeting(customer.name)}, ${formatMoney(customer.outstanding)} is pending on your account at ${shop.name}.`];
  if (khataUrl) lines.push(`See your khata and pay here: ${khataUrl}`);
  else if (shop.upi_id) lines.push(`You can pay by UPI to ${shop.upi_id}.`);
  lines.push("Thank you.", signature(shop));
  return lines.join("\n");
}

/** Sharing the khata link: "Namaste Rahul, here is your khata at Raj Local Mart: <link>". */
export function khataLinkMessage(customerName: string, shop: ShopInfo, khataUrl: string): string {
  return [
    `${greeting(customerName)}, here is your khata at ${shop.name}.`,
    "See your dues, orders and payments, pay by UPI, and send us your orders:",
    khataUrl,
    signature(shop),
  ].join("\n");
}

/** A text receipt for an order. */
export function receiptMessage(order: MessageOrder, shop: ShopInfo): string {
  const lines = [
    `Receipt from ${shop.name}`,
    `Order ${orderNo(order.number)} · ${formatDate(order.created_at)}, ${formatTime(order.created_at)}`,
    "",
    ...order.items.map(itemLine),
    "",
  ];
  if (order.discount > 0) lines.push(`Discount: ${formatMoney(-order.discount)}`);
  lines.push(`*Total: ${formatMoney(order.total)}*`);
  if (order.outstanding <= 0) {
    lines.push("Paid in full.");
  } else {
    lines.push(`Paid: ${formatMoney(order.paid)}`, `Due: ${formatMoney(order.outstanding)}`);
    if (shop.upi_id) lines.push(`Pay by UPI to ${shop.upi_id}.`);
  }
  lines.push("", "Thank you for shopping with us.", signature(shop));
  return lines.join("\n");
}
