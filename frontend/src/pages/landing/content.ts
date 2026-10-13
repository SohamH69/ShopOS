// Copy for the landing page, kept apart from layout so the components stay readable.

import type { Severity } from "../../lib/types";

export interface SectionLink {
  id: string;
  label: string;
}

/** Header and menu links, in the order the spec lists them. */
export const SECTION_LINKS: readonly SectionLink[] = [
  { id: "features", label: "Features" },
  { id: "how-it-works", label: "How it works" },
  // { id: "pricing", label: "Pricing" }, // hidden with the pricing section
  { id: "get-app", label: "Get the app" },
];

/** The plan's real paper workflow for a "keep it ready, I'll collect it later" order. */
export const PAPER_STEPS: readonly string[] = [
  "Customer calls",
  "Order written on paper",
  "“I’ll collect it later”",
  "Paper kept somewhere",
  "Customer arrives",
  "Search for the slip",
  "Check the notebook for the amount",
  "Customer pays by UPI",
  "Update the notebook by hand",
];

export const SHOPOS_STEPS: ReadonlyArray<{ title: string; line: string }> = [
  {
    title: "Open the order",
    line: "Search a name, phone number or order number. Items, total and dues are on one screen.",
  },
  {
    title: "Collect payment",
    line: "Cash or UPI, in full or in part. Whatever is left goes to their khata by itself.",
  },
  {
    title: "Mark collected",
    line: "Stock updates and the order leaves your pickup list.",
  },
];

export interface AttentionExample {
  key: string;
  value: string;
  label: string;
  detail: string | null;
  severity: Severity;
}

/** A believable Today queue, most severe first (the same rules as the real dashboard). */
export const ATTENTION_EXAMPLE: readonly AttentionExample[] = [
  { key: "pickups", value: "8", label: "orders waiting for pickup", detail: "2 overdue", severity: "high" },
  { key: "customer_dues", value: "₹18,700", label: "customer dues", detail: "across 11 customers", severity: "high" },
  { key: "low_stock", value: "5", label: "products running low", detail: "1 out of stock", severity: "medium" },
  { key: "deliveries", value: "3", label: "deliveries pending", detail: null, severity: "medium" },
  { key: "supplier_dues", value: "2", label: "supplier payments due", detail: "₹9,850 in total", severity: "low" },
];

export interface OrderEffect {
  key: "pickups" | "payments" | "khata" | "stock" | "reports";
  book: string;
  change: string;
  detail: string;
  tone?: "due" | "received";
}

/** What marking the hero's order #1045 collected (₹300 paid by UPI, the rest on khata) updates. */
export const ORDER_EFFECTS: readonly OrderEffect[] = [
  { key: "pickups", book: "Pickups", change: "Collected", detail: "#1045 leaves the pickup list" },
  { key: "payments", book: "Payments", change: "+₹300", detail: "Received by UPI", tone: "received" },
  { key: "khata", book: "Khata", change: "+₹358", detail: "Added to Rahul Sharma's balance", tone: "due" },
  { key: "stock", book: "Stock", change: "−5 kg", detail: "Basmati rice, and 1 Tea powder" },
  { key: "reports", book: "Reports", change: "+₹658", detail: "In today's sales" },
];

export const MODULES: ReadonlyArray<{ name: string; line: string }> = [
  {
    name: "Orders",
    line: "Walk-in, phone, WhatsApp and delivery orders, with order status and payment status tracked separately.",
  },
  {
    name: "Pending pickups",
    line: "“Keep it ready, I’ll collect it later” is handled. Every waiting order in one list, ready ones first.",
  },
  { name: "Khata", line: "A credit ledger for every customer, with a running balance and payment promises." },
  { name: "Payments", line: "Cash, UPI, card and bank transfer. Part payments, and several payments on one order." },
  { name: "Inventory", line: "Stock drops by itself when an order is completed, and low-stock alerts warn you in time." },
  { name: "Suppliers", line: "Purchases from each supplier, what you owe them, and what you've paid." },
  { name: "Expenses", line: "Rent, electricity, salaries and other running costs, by category." },
  { name: "Reports", line: "Daily, weekly and monthly sales, your top customers, and fast and slow movers." },
  { name: "Staff roles", line: "Owner, manager, employee and accountant, each seeing only what they need." },
  { name: "WhatsApp messages", line: "Order confirmation, ready for pickup, payment reminder and receipt, each in one tap." },
];

export interface KhataExampleEntry {
  key: string;
  date: string;
  activity: string;
  reference: string;
  amount: number; // + purchase, − payment
  balance: number;
}

export const KHATA_EXAMPLE: readonly KhataExampleEntry[] = [
  { key: "o1032", date: "20 Aug", activity: "Purchase", reference: "Order #1032", amount: 1400, balance: 1400 },
  { key: "p1", date: "25 Aug", activity: "Payment", reference: "UPI", amount: -1000, balance: 400 },
  { key: "o1041", date: "28 Aug", activity: "Purchase", reference: "Order #1041", amount: 850, balance: 1250 },
];

export interface Plan {
  id: string;
  name: string;
  /** "from" before the price, for the Business plan. */
  pricePrefix?: string;
  price: string;
  period: string | null;
  summary: string;
  /** "Everything in Basic, plus" for the higher plans. */
  includes?: string;
  features: readonly string[];
  cta: string;
  featured?: boolean;
}

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    price: "₹0",
    period: null,
    summary: "For trying ShopOS at a small counter.",
    features: ["1 user", "Up to 100 orders a month", "Basic customers, payments and reports"],
    cta: "Start free",
  },
  {
    id: "basic",
    name: "Basic",
    price: "₹249",
    period: "/month",
    summary: "Everything a one-counter shop runs on.",
    features: ["Unlimited orders", "Customers and khata", "Payments", "Inventory", "Reports"],
    cta: "Start with Basic",
    featured: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "₹649",
    period: "/month",
    summary: "For shops with staff and regular suppliers.",
    includes: "Everything in Basic, plus",
    features: [
      "Multiple staff",
      "Advanced reports",
      "WhatsApp automation",
      "Supplier management",
      "Customer analytics",
      "Payment reminders",
    ],
    cta: "Start with Pro",
  },
  {
    id: "business",
    name: "Business",
    pricePrefix: "from",
    price: "₹1,000",
    period: "/month",
    summary: "For shops with more than one branch.",
    includes: "Everything in Pro, plus",
    features: [
      "Multiple branches",
      "Advanced permissions",
      "Multi-location inventory",
      "API integrations",
      "Priority support",
    ],
    cta: "Start with Business",
  },
];

export const FAQS: ReadonlyArray<{ question: string; answer: string }> = [
  {
    question: "Do I need a computer?",
    answer:
      "No. ShopOS works on a phone, a tablet or the computer at your counter. Use whichever is closest. Everything stays in sync.",
  },
  {
    question: "Can my staff use it?",
    answer:
      "Yes. Give each person their own login as a manager, employee or accountant, and choose what each role can see and do.",
  },
  {
    question: "What if the internet goes down?",
    answer:
      "The app still opens and shows the screens you last loaded, but saving orders and payments needs a connection. Once you're back online, carry on where you left off.",
  },
  {
    question: "Is my data safe?",
    answer:
      "Every shop's data is kept separate, and only the people you add can sign in. You decide what each role can see, and you can turn off a staff login at any time.",
  },
  {
    question: "Can I bring my existing customer list?",
    answer:
      "Yes. Import a CSV file of customers or products from Settings. Customers are matched by phone number, so nobody is added twice.",
  },
];
