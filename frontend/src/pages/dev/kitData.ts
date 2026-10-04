// Realistic sample records for the dev-only design QA gallery (/kit). Never used by real pages.

import type { Order, OrderItem, OrderStatus, PaymentStatus, Product } from "../../lib/types";

const TODAY = new Date();

function minutesAgo(minutes: number): string {
  return new Date(TODAY.getTime() - minutes * 60_000).toISOString();
}

function item(id: number, name: string, unit: string, quantity: number, unitPrice: number): OrderItem {
  return { id, product_id: id, name, unit, quantity, unit_price: unitPrice, discount: 0, line_total: Math.round(quantity * unitPrice * 100) / 100 };
}

function order(
  id: number,
  customer: string | null,
  status: OrderStatus,
  paymentStatus: PaymentStatus,
  items: OrderItem[],
  paid: number,
  minutes: number,
  extra: Partial<Order> = {},
): Order {
  const total = items.reduce((sum, line) => sum + line.line_total, 0);
  return {
    id,
    number: 1040 + id,
    customer_id: customer ? id : null,
    customer_name: customer,
    customer_phone: customer ? "98765 43210" : null,
    status,
    payment_status: paymentStatus,
    fulfillment: "pickup",
    channel: "walk_in",
    due_at: null,
    is_overdue: false,
    delivery_address: "",
    notes: "",
    items,
    item_count: items.length,
    subtotal: total,
    discount: 0,
    total,
    paid,
    outstanding: Math.max(0, total - paid),
    created_at: minutesAgo(minutes),
    updated_at: minutesAgo(minutes),
    completed_at: null,
    created_by_name: "Arjun Pawar",
    ...extra,
  };
}

export const SAMPLE_ORDERS: Order[] = [
  order(1, "Rahul Sharma", "ready", "unpaid", [item(1, "Basmati rice", "kg", 5, 92), item(2, "Tea powder 500g", "pcs", 1, 198)], 0, 12, { channel: "whatsapp" }),
  order(2, "Priya Kulkarni", "preparing", "partial", [item(3, "Toor dal", "kg", 2, 148), item(4, "Sunflower oil 1L", "pcs", 2, 165), item(5, "Jaggery", "kg", 1, 64)], 300, 34, { channel: "phone" }),
  order(3, null, "collected", "paid", [item(6, "Parle-G 250g", "pcs", 4, 25), item(7, "Amul butter 100g", "pcs", 1, 58)], 158, 51),
  order(4, "Sanjay Patil", "new", "unpaid", [item(8, "Wheat flour", "kg", 10, 44)], 0, 66, { fulfillment: "delivery", delivery_address: "B-12, Prabhat Road, Erandwane" }),
  order(5, "Anita Deshpande", "delivered", "paid", [item(9, "Ghee 500ml", "pcs", 1, 345), item(10, "Sugar", "kg", 3, 46)], 483, 140, { fulfillment: "delivery" }),
  order(6, "Farhan Shaikh", "ready", "partial", [item(11, "Rajma", "kg", 1.5, 156), item(12, "Garam masala 100g", "pcs", 2, 72)], 100, 190),
  order(7, "Meenal Joshi", "cancelled", "unpaid", [item(13, "Detergent 1kg", "pcs", 1, 210)], 0, 260),
  order(8, "Vikram Rao", "collected", "paid", [item(14, "Groundnut oil 1L", "pcs", 1, 189), item(15, "Poha", "kg", 1, 58), item(16, "Moong dal", "kg", 1, 132)], 379, 320),
];

export const SAMPLE_PRODUCTS: Product[] = [
  ["Basmati rice", "Staples", "kg", 42, 10, 74, 92],
  ["Toor dal", "Pulses", "kg", 6, 8, 120, 148],
  ["Sunflower oil 1L", "Oils & Ghee", "pcs", 24, 6, 138, 165],
  ["Tea powder 500g", "Beverages", "pcs", 0, 4, 160, 198],
  ["Parle-G 250g", "Snacks", "pcs", 60, 12, 21, 25],
  ["Amul butter 100g", "Dairy", "pcs", 3, 5, 52, 58],
  ["Garam masala 100g", "Spices", "pcs", 15, 4, 55, 72],
  ["Wheat flour", "Staples", "kg", 80, 20, 36, 44],
].map(([name, category, unit, stock, min, cost, price], index) => {
  const stockQuantity = Number(stock);
  const minimum = Number(min);
  const purchase = Number(cost);
  const selling = Number(price);
  return {
    id: index + 1,
    name: String(name),
    category: String(category),
    unit: unit === "kg" ? "kg" : "pcs",
    sku: `SKU-${1000 + index}`,
    stock_quantity: stockQuantity,
    min_stock_level: minimum,
    reserved_quantity: index % 3 === 0 ? 2 : 0,
    purchase_price: purchase,
    selling_price: selling,
    low_stock: stockQuantity <= minimum,
    stock_value: stockQuantity * purchase,
    margin_percent: ((selling - purchase) / selling) * 100,
    is_archived: false,
    created_at: minutesAgo(60 * 24 * 40),
    updated_at: minutesAgo(60 * 24),
  } satisfies Product;
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SALES_7D = [14250, 11800, 12640, 9980, 15320, 21460, 18450].map((value, index, all) => {
  const date = new Date(TODAY.getTime() - (all.length - 1 - index) * 86_400_000);
  return {
    label: index === all.length - 1 ? "Today" : WEEKDAYS[date.getDay()],
    value,
    secondary: `${Math.round(value / 520)} orders`,
    highlight: index === all.length - 1,
  };
});

export const SALES_30D = Array.from({ length: 30 }, (_, index) => {
  const date = new Date(TODAY.getTime() - (29 - index) * 86_400_000);
  const weekend = date.getDay() === 0 || date.getDay() === 6;
  const value = Math.round((weekend ? 17000 : 11500) + Math.sin(index * 1.7) * 2600 + (index % 4) * 450);
  return {
    label: `${date.getDate()} ${date.toLocaleString("en-IN", { month: "short" })}`,
    value,
    secondary: `${Math.round(value / 510)} orders`,
    highlight: index === 29,
  };
});

export const PAYMENTS_BY_METHOD = [
  { key: "upi", label: "UPI", value: 182450, hint: "412 payments" },
  { key: "cash", label: "Cash", value: 116300, hint: "298 payments" },
  { key: "card", label: "Card", value: 24800, hint: "31 payments" },
  { key: "bank", label: "Bank transfer", value: 12600, hint: "6 payments" },
];
