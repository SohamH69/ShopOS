import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Order, OrderItem } from "./types";
import { upiPaymentUri } from "./upi";
import {
  hasWhatsAppNumber,
  orderConfirmationMessage,
  paymentReminderMessage,
  pickupReadyMessage,
  receiptMessage,
  waLink,
  type ShopInfo,
} from "./whatsapp";

const shop: ShopInfo = {
  name: "Raj Local Mart",
  phone: "+91 98765 00001",
  address: "Shop 4, Lane 3, Model Colony, Pune 411016",
  upi_id: "rajlocalmart@upi",
};

function item(overrides: Partial<OrderItem>): OrderItem {
  return { id: 1, product_id: 1, name: "Item", unit: "pcs", quantity: 1, unit_price: 0, discount: 0, line_total: 0, ...overrides };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 45,
    number: 1045,
    customer_id: 7,
    customer_name: "Rahul Sharma",
    customer_phone: "9876543210",
    status: "new",
    payment_status: "partial",
    fulfillment: "pickup",
    channel: "whatsapp",
    due_at: null,
    is_overdue: false,
    delivery_address: "",
    notes: "",
    items: [
      item({ id: 1, name: "Basmati rice", unit: "kg", quantity: 5, unit_price: 92, line_total: 460 }),
      item({ id: 2, name: "Tea powder 500g", unit: "pcs", quantity: 1, unit_price: 198, line_total: 198 }),
    ],
    item_count: 2,
    subtotal: 658,
    discount: 0,
    total: 658,
    paid: 300,
    outstanding: 358,
    created_at: "2026-10-04T09:00:00+00:00",
    updated_at: "2026-10-04T09:00:00+00:00",
    completed_at: null,
    created_by_name: "Raj Deshmukh",
    ...overrides,
  };
}

describe("waLink", () => {
  it("adds the Indian country code to 10-digit numbers and encodes the text", () => {
    expect(waLink("98765 43210", "Hello world")).toBe("https://wa.me/919876543210?text=Hello%20world");
    expect(waLink("+91 98765 00001", "x")).toBe("https://wa.me/919876500001?text=x");
  });

  it("falls back to the contact picker without a usable number", () => {
    expect(waLink(null, "Hi")).toBe("https://wa.me/?text=Hi");
    expect(waLink("123", "Hi")).toBe("https://wa.me/?text=Hi");
  });

  it("encodes line breaks and the rupee sign", () => {
    expect(waLink("9876543210", "₹10\nok")).toBe("https://wa.me/919876543210?text=%E2%82%B910%0Aok");
  });

  it("knows when a number can receive messages", () => {
    expect(hasWhatsAppNumber("98765 43210")).toBe(true);
    expect(hasWhatsAppNumber("")).toBe(false);
    expect(hasWhatsAppNumber(null)).toBe(false);
    expect(hasWhatsAppNumber("12345")).toBe(false);
  });
});

describe("messages", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T10:00:00+00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("confirms an order with items, amounts and pickup time", () => {
    const text = orderConfirmationMessage(order({ due_at: "2026-10-04T13:00:00+00:00" }), shop);
    expect(text.startsWith("Namaste Rahul,\nyour order #1045 at Raj Local Mart is confirmed.")).toBe(true);
    expect(text).toContain("5 kg Basmati rice — ₹460");
    expect(text).toContain("1 × Tea powder 500g — ₹198");
    expect(text).toContain("*Total: ₹658*");
    expect(text).toContain("Paid: ₹300\nDue: ₹358");
    expect(text).toContain("We'll keep it ready for pickup by 6:30 pm.");
    expect(text.endsWith("— Raj Local Mart, +91 98765 00001")).toBe(true);
  });

  it("confirms a delivery order with the address", () => {
    const text = orderConfirmationMessage(
      order({ fulfillment: "delivery", delivery_address: "Flat 2, Prabhat Road", paid: 0, outstanding: 658 }),
      shop,
    );
    expect(text).toContain("To pay: ₹658");
    expect(text).toContain("We'll deliver it soon to: Flat 2, Prabhat Road");
  });

  it("tells the customer a pickup is ready and what to pay", () => {
    const text = pickupReadyMessage(order({ status: "ready" }), shop);
    expect(text).toContain("Namaste Rahul, your order #1045 is ready for pickup at Raj Local Mart.");
    expect(text).toContain("Amount to pay: ₹358.");
    expect(text).toContain("Address: Shop 4, Lane 3, Model Colony, Pune 411016");
  });

  it("tells the customer a delivery is on its way", () => {
    const text = pickupReadyMessage(order({ fulfillment: "delivery", paid: 658, outstanding: 0 }), shop);
    expect(text).toContain("is ready and will be delivered soon.");
    expect(text).not.toContain("Please keep");
  });

  it("reminds a customer about khata dues", () => {
    const text = paymentReminderMessage({ name: "Rahul Sharma", outstanding: 1250 }, shop);
    expect(text.split("\n")[0]).toBe("Namaste Rahul, ₹1,250 is pending on your account at Raj Local Mart.");
    expect(text).toContain("You can pay by UPI to rajlocalmart@upi.");
  });

  it("leaves out UPI when the shop has none", () => {
    const text = paymentReminderMessage({ name: "Rahul Sharma", outstanding: 500 }, { ...shop, upi_id: null });
    expect(text).not.toContain("UPI");
  });

  it("writes a receipt", () => {
    const paid = receiptMessage(order({ paid: 658, outstanding: 0 }), shop);
    expect(paid.startsWith("Receipt from Raj Local Mart\nOrder #1045 · 4 Oct, 2:30 pm")).toBe(true);
    expect(paid).toContain("Paid in full.");
    expect(paid).toContain("Thank you for shopping with us.");

    const due = receiptMessage(order({ discount: 20, total: 638, outstanding: 338 }), shop);
    expect(due).toContain(`Discount: −₹20`);
    expect(due).toContain("Due: ₹338");
    expect(due).toContain("Pay by UPI to rajlocalmart@upi.");
  });

  it("greets without a name for walk-in orders", () => {
    const text = pickupReadyMessage(order({ customer_name: null }), shop);
    expect(text.startsWith("Namaste, your order #1045")).toBe(true);
  });
});

describe("upiPaymentUri", () => {
  it("builds a UPI deep link with the amount and note", () => {
    expect(upiPaymentUri({ upiId: "rajlocalmart@upi", payeeName: "Raj Local Mart", amount: 358, note: "Order 1045" })).toBe(
      "upi://pay?pa=rajlocalmart@upi&pn=Raj%20Local%20Mart&am=358.00&cu=INR&tn=Order%201045",
    );
  });

  it("omits the amount when there is nothing to collect", () => {
    expect(upiPaymentUri({ upiId: "shop@upi", payeeName: "Shop", amount: 0 })).toBe("upi://pay?pa=shop@upi&pn=Shop&cu=INR");
  });
});
