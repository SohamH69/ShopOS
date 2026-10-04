// Design QA gallery for the ShopOS UI kit. Mounted at /kit in development builds only.

import {
  Archive,
  Banknote,
  CircleCheck,
  ClipboardList,
  MessageCircle,
  Pencil,
  Plus,
  Printer,
  Send,
  Trash2,
  Truck,
} from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Logo } from "../../components/brand/Logo";
import {
  Avatar,
  Badge,
  BarList,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  Chip,
  ColumnChart,
  Combobox,
  ConfirmDialog,
  DataTable,
  DescriptionList,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  Kbd,
  LoadMore,
  Menu,
  Modal,
  Money,
  MoneyInput,
  OrderStatusBadge,
  PageHeader,
  PaymentStatusBadge,
  QuantityInput,
  SearchInput,
  SegmentedControl,
  Select,
  Skeleton,
  SkeletonText,
  Sparkline,
  Spinner,
  Stamp,
  StatStrip,
  StockMeter,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  Trend,
  useToast,
  type DataColumn,
} from "../../components/ui";
import { CustomerPicker } from "../../features/pickers/CustomerPicker";
import { ProductPicker } from "../../features/pickers/ProductPicker";
import { ApiError, errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { CHANNEL_LABEL, METHOD_SHORT_LABEL, toOptions } from "../../lib/constants";
import { formatItemsSummary, formatMoney, formatQty, formatRelative, orderNo } from "../../lib/format";
import { useDocumentTitle } from "../../lib/hooks";
import { lineTotal } from "../../lib/money";
import type { Customer, Order, OrderStatus, PaymentMethod, PaymentStatus, Product } from "../../lib/types";
import { PAYMENTS_BY_METHOD, SALES_30D, SALES_7D, SAMPLE_ORDERS, SAMPLE_PRODUCTS } from "./kitData";
import styles from "./KitPage.module.css";

const SECTIONS = [
  ["tokens", "Colour & type"],
  ["buttons", "Buttons"],
  ["forms", "Forms"],
  ["choices", "Choices"],
  ["pickers", "Pickers"],
  ["status", "Status"],
  ["stamp", "Stamp"],
  ["layout", "Layout"],
  ["stats", "Stats"],
  ["table", "Table"],
  ["feedback", "Feedback"],
  ["overlays", "Overlays"],
  ["charts", "Charts"],
] as const;

const SWATCHES: readonly [string, string][] = [
  ["--paper", "#ffffff"],
  ["--desk", "#f4f6fa"],
  ["--desk-2", "#eceff5"],
  ["--ink", "#161a23"],
  ["--ink-2", "#4a5162"],
  ["--ink-3", "#737b8c"],
  ["--ink-4", "#a6adbb"],
  ["--rule", "#dfe5ef"],
  ["--rule-strong", "#c9d2e1"],
  ["--pen", "#2b45b5"],
  ["--pen-tint", "#eef1fc"],
  ["--pen-tint-2", "#dfe5fa"],
  ["--margin", "#d63b3b"],
  ["--margin-text", "#b42828"],
  ["--margin-tint", "#fdeeee"],
  ["--stamp", "#6e3fb0"],
  ["--stamp-tint", "#f3eefb"],
  ["--haldi", "#e8a317"],
  ["--haldi-text", "#8a5b00"],
  ["--haldi-tint", "#fdf5e1"],
  ["--leaf", "#1f8a5b"],
  ["--leaf-text", "#17724a"],
  ["--leaf-tint", "#e7f5ee"],
];

const ORDER_STATUSES: OrderStatus[] = ["new", "preparing", "ready", "collected", "delivered", "cancelled"];
const PAYMENT_STATUSES: PaymentStatus[] = ["unpaid", "partial", "paid"];

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section id={id} className={styles.section} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={styles.sectionTitle}>
        {title}
      </h2>
      {note && <p className={styles.sectionNote}>{note}</p>}
      {children}
    </section>
  );
}

function Row({ label, children, top = false }: { label?: string; children: ReactNode; top?: boolean }) {
  return (
    <div className={top ? `${styles.row} ${styles.rowTop}` : styles.row}>
      {label && <span className={styles.label}>{label}</span>}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TokensSection() {
  return (
    <Section id="tokens" title="Colour & type" note="White paper, pale-blue ruling, ballpoint pen, a red margin and violet stamp ink.">
      <div className={styles.swatches}>
        {SWATCHES.map(([name, value]) => (
          <div key={name} className={styles.swatch}>
            <span className={styles.swatchColor} style={{ background: `var(${name})` }} />
            <span className={styles.swatchName}>{name}</span>
            <span className={styles.swatchValue}>{value}</span>
          </div>
        ))}
      </div>
      <Card title="Type" description="Anek Latin condensed for titles and big numbers, Mukta for everything you read, Spline Sans Mono for figures.">
        <div className={styles.typeSample}>
          <span className={styles.displayXL}>Never lose track of an order again.</span>
          <span className={styles.displayL}>₹18,450 · Today</span>
          <span className={styles.bodyL}>Body 17 — Rahul's order is ready for pickup.</span>
          <span>Body 15 — Collect ₹850 and mark the order collected.</span>
          <span className="muted">Body 13 muted — Last order 2h ago · Pune</span>
          <span className={styles.monoSample}>#1045 · ₹1,23,456.50 · 6:30 pm · SKU-1004</span>
          <Row label="Logo">
            <Logo size={24} />
            <Logo />
            <Logo size={40} />
            <Logo variant="mark" size={40} />
          </Row>
        </div>
      </Card>
    </Section>
  );
}

function ButtonsSection() {
  const [selected, setSelected] = useState("evening");
  return (
    <Section id="buttons" title="Buttons" note="One primary action per view. Labels say exactly what happens.">
      <Card>
        <div className={styles.stack}>
          {(["sm", "md", "lg"] as const).map((size) => (
            <Row key={size} label={`Size ${size}`}>
              <Button size={size} variant="primary" icon={<Plus aria-hidden="true" />}>
                New order
              </Button>
              <Button size={size}>Record payment</Button>
              <Button size={size} variant="ghost">
                Clear filters
              </Button>
              <Button size={size} variant="danger">
                Void payment
              </Button>
            </Row>
          ))}
          <Row label="States">
            <Button variant="primary" loading>
              Collect ₹850
            </Button>
            <Button loading>Saving</Button>
            <Button variant="primary" disabled>
              Create order
            </Button>
            <Button disabled>Mark ready</Button>
          </Row>
          <Row label="Links">
            <ButtonLink to="/app/orders" icon={<ClipboardList aria-hidden="true" />}>
              Open orders
            </ButtonLink>
            <ButtonLink href="https://wa.me/?text=Namaste" newTab icon={<MessageCircle aria-hidden="true" />}>
              Send on WhatsApp
            </ButtonLink>
            <ButtonLink to="/app" disabled>
              Disabled link
            </ButtonLink>
          </Row>
          <Row label="Icon">
            <IconButton label="Edit" icon={<Pencil aria-hidden="true" />} />
            <IconButton label="Print receipt" icon={<Printer aria-hidden="true" />} variant="secondary" />
            <IconButton label="Delete" icon={<Trash2 aria-hidden="true" />} variant="danger" />
            <IconButton label="Saving" icon={<Send aria-hidden="true" />} loading />
          </Row>
          <Row label="Chips">
            <Chip selected={selected === "hour"} onClick={() => setSelected("hour")}>
              In 1 hour
            </Chip>
            <Chip selected={selected === "evening"} onClick={() => setSelected("evening")}>
              This evening (7 pm)
            </Chip>
            <Chip selected={selected === "tomorrow"} onClick={() => setSelected("tomorrow")}>
              Tomorrow morning (10 am)
            </Chip>
            <Chip icon={<Banknote aria-hidden="true" />}>Full ₹658</Chip>
          </Row>
          <Button variant="primary" block size="lg">
            Create & mark collected
          </Button>
        </div>
      </Card>
    </Section>
  );
}

function FormsSection() {
  const [name, setName] = useState("Rahul Sharma");
  const [phone, setPhone] = useState("98765");
  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState<number | null>(658);
  const [kg, setKg] = useState(2.5);
  const [pcs, setPcs] = useState(3);
  const [channel, setChannel] = useState("");
  const [sms, setSms] = useState(true);
  const [handover, setHandover] = useState(true);

  return (
    <Section id="forms" title="Forms" note="Every control has a label; errors say what to fix.">
      <Card>
        <div className={styles.formGrid}>
          <Field label="Customer name" hint="As you'd write it in the khata.">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Phone" error={phone.replace(/\D/g, "").length < 10 ? "Enter a 10-digit mobile number." : undefined}>
            <Input value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Search" labelHidden>
            <SearchInput value={search} onChange={setSearch} placeholder="Search by order #, customer or product" />
          </Field>
          <Field label="Email" optional>
            <Input type="email" placeholder="name@example.com" />
          </Field>
          <Field label="Paid now" hint={`Leaves ${formatMoney(Math.max(0, 658 - (amount ?? 0)))} on the khata.`}>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Channel">
            <Select<string>
              value={channel}
              onValueChange={setChannel}
              placeholder="Any channel"
              options={toOptions(CHANNEL_LABEL)}
            />
          </Field>
          <Field label="Loose item (kg)">
            <QuantityInput value={kg} onChange={setKg} step={0.25} min={0.25} unit="kg" />
          </Field>
          <Field label="Packets">
            <QuantityInput value={pcs} onChange={setPcs} step={1} min={1} unit="pcs" size="sm" />
          </Field>
          <Field label="Notes" optional>
            <Textarea placeholder="Less spicy masala; deliver after 6 pm." />
          </Field>
          <Field label="Disabled">
            <Input value="Raj Local Mart" disabled readOnly />
          </Field>
        </div>
        <div className={styles.stack} style={{ marginTop: 20 }}>
          <Checkbox label="Update buy prices to these costs" checked={sms} onCheckedChange={setSms} />
          <Checkbox
            label="Orders & pickups"
            description="Create orders, update their status and collect payment on them."
            defaultChecked
          />
          <Checkbox label="Some roles" indeterminate readOnly />
          <Checkbox label="Owner always has everything" checked disabled readOnly />
          <Switch label="Hand over now (mark collected)" checked={handover} onCheckedChange={setHandover} />
          <Switch label="Send payment reminders" description="WhatsApp message when a promise date passes." />
        </div>
      </Card>
    </Section>
  );
}

function ChoicesSection() {
  const [status, setStatus] = useState("open");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [tab, setTab] = useState("khata");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const lower = query.trim().toLowerCase();
  const matches = SAMPLE_PRODUCTS.filter((product) => !lower || product.name.toLowerCase().includes(lower)).slice(0, 6);

  return (
    <Section id="choices" title="Choices" note="Segmented controls for a few options, tabs for views, a combobox for long lists.">
      <Card>
        <div className={styles.stack}>
          <Row label="Segmented">
            <SegmentedControl
              label="Order status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "all", label: "All", count: 231 },
                { value: "open", label: "Open", count: 14 },
                { value: "ready", label: "Ready", count: 6 },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ]}
            />
          </Row>
          <Row label="Small">
            <SegmentedControl
              label="Payment method"
              size="sm"
              value={method}
              onChange={setMethod}
              options={toOptions(METHOD_SHORT_LABEL)}
            />
          </Row>
          <Tabs
            id="kit-tabs"
            label="Customer views"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: "khata", label: "Khata" },
              { value: "orders", label: "Orders", count: 18 },
              { value: "payments", label: "Payments", count: 9 },
            ]}
          />
          <TabPanel tabsId="kit-tabs" value="khata" current={tab}>
            <p className="muted">The ledger of purchases and payments, newest first.</p>
          </TabPanel>
          <TabPanel tabsId="kit-tabs" value="orders" current={tab}>
            <p className="muted">Every order this customer placed.</p>
          </TabPanel>
          <TabPanel tabsId="kit-tabs" value="payments" current={tab}>
            <p className="muted">Payments received from this customer.</p>
          </TabPanel>
          <Field label="Add a product" hint={picked.length ? `Added: ${picked.join(", ")}` : "Type, use ↑ ↓, press Enter to add."}>
            <Combobox<Product>
              inputValue={query}
              onInputChange={setQuery}
              options={matches}
              getOptionKey={(product) => product.id}
              keepOpenOnSelect
              onSelect={(product) => {
                setPicked((list) => [...list, product.name]);
                setQuery("");
              }}
              placeholder="Type a product name or SKU"
              renderOption={(product) => (
                <span style={{ display: "flex", width: "100%", justifyContent: "space-between", gap: 12 }}>
                  <span>
                    {product.name}
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {product.category} · {formatQty(product.stock_quantity, product.unit)} in stock
                    </span>
                  </span>
                  <Money value={product.selling_price} size="sm" />
                </span>
              )}
              trailingActions={
                query.trim()
                  ? [{ key: "custom", label: `Add custom item “${query.trim()}”`, icon: <Plus />, onSelect: (text) => setPicked((list) => [...list, text]) }]
                  : []
              }
              footer="↑ ↓ to choose · Enter to add · Esc to close"
            />
          </Field>
        </div>
      </Card>
    </Section>
  );
}

function PickersSection() {
  const { status, demoLogin } = useAuth();
  const toast = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [lines, setLines] = useState<{ key: string; name: string; quantity: number; unit: string }[]>([]);
  const [signingIn, setSigningIn] = useState(false);

  if (status !== "signedIn") {
    return (
      <Section id="pickers" title="Pickers" note="They search your shop's real customers and products, so they need a signed-in session.">
        <Card>
          <EmptyState
            compact
            title="Sign in to try the pickers."
            action={
              <Button
                variant="primary"
                loading={signingIn}
                onClick={async () => {
                  setSigningIn(true);
                  try {
                    await demoLogin();
                  } catch (error) {
                    toast.error(errorMessage(error));
                  } finally {
                    setSigningIn(false);
                  }
                }}
              >
                Use the demo shop
              </Button>
            }
          />
        </Card>
      </Section>
    );
  }

  const inOrder = Object.fromEntries(lines.filter((line) => line.key.startsWith("p")).map((line) => [Number(line.key.slice(1)), line.quantity]));

  return (
    <Section id="pickers" title="Pickers" note="Customer search with dues and inline add; product search with stock and price.">
      <div className={styles.grid2}>
        <Card title="Customer">
          <div className={styles.stack}>
            <Field label="Customer" hint={walkIn && !customer ? "Walk-in: the order must be paid in full." : undefined}>
              <CustomerPicker
                value={customer}
                onChange={(next) => {
                  setCustomer(next);
                  if (next) setWalkIn(false);
                }}
                allowWalkIn
                onWalkIn={() => setWalkIn(true)}
              />
            </Field>
          </div>
        </Card>
        <Card title="Products">
          <div className={styles.stack}>
            <Field label="Add a product">
              <ProductPicker
                inOrder={inOrder}
                onSelect={(product) =>
                  setLines((current) => {
                    const key = `p${product.id}`;
                    const existing = current.find((line) => line.key === key);
                    if (existing) return current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line));
                    return [...current, { key, name: product.name, quantity: 1, unit: product.unit }];
                  })
                }
                onCustomItem={(name) => setLines((current) => [...current, { key: `c${current.length}`, name, quantity: 1, unit: "pcs" }])}
              />
            </Field>
            {lines.length > 0 ? (
              <DescriptionList items={lines.map((line) => ({ key: line.key, label: formatQty(line.quantity, line.unit), value: line.name }))} />
            ) : (
              <p className="muted">Added items show up here.</p>
            )}
          </div>
        </Card>
      </div>
    </Section>
  );
}

function StatusSection() {
  return (
    <Section id="status" title="Status" note="Order status (a dot and a word) and payment status (a stamped mark) are independent.">
      <Card>
        <div className={styles.stack}>
          <Row label="Order">
            {ORDER_STATUSES.map((status) => (
              <OrderStatusBadge key={status} status={status} />
            ))}
          </Row>
          <Row label="Payment">
            {PAYMENT_STATUSES.map((status) => (
              <PaymentStatusBadge key={status} status={status} />
            ))}
          </Row>
          <Row label="Together">
            <OrderStatusBadge status="ready" />
            <PaymentStatusBadge status="unpaid" />
            <span className="muted">·</span>
            <OrderStatusBadge status="collected" />
            <PaymentStatusBadge status="paid" />
          </Row>
          <Row label="Badges">
            <Badge>Owner</Badge>
            <Badge tone="pen">Basic plan</Badge>
            <Badge tone="margin">Overdue</Badge>
            <Badge tone="haldi">Only 3 left</Badge>
            <Badge tone="leaf" icon={<CircleCheck aria-hidden="true" />}>
              Settled
            </Badge>
            <Badge tone="stamp">Paid</Badge>
            <Badge size="sm" tone="margin">
              Promise overdue
            </Badge>
          </Row>
        </div>
      </Card>
    </Section>
  );
}

function StampSection() {
  const [take, setTake] = useState(0);
  return (
    <Section id="stamp" title="Stamp" note="The signature. Only on: the landing demo, an order becoming fully paid, receipts and a settled khata.">
      <div className={styles.grid2}>
        <Card title="Static" description="Paid, Settled, Collected, Delivered at every size.">
          <div className={styles.stack} style={{ gap: 32 }}>
            {(["sm", "md", "lg"] as const).map((size) => (
              <Row key={size} label={size}>
                <Stamp size={size} label="Paid" />
                <Stamp size={size} label="Settled" />
                {size !== "lg" && <Stamp size={size} label="Collected" />}
                {size !== "lg" && <Stamp size={size} label="Delivered" />}
              </Row>
            ))}
          </div>
        </Card>
        <Card
          title="Stamp-in"
          description="Lands with a press and a brief ink spread. Static with reduced motion."
          actions={
            <Button size="sm" onClick={() => setTake((value) => value + 1)}>
              Stamp it
            </Button>
          }
        >
          <div className={styles.stack}>
            <div className={styles.stampStage}>
              <Stamp key={take} label="Paid" size="lg" animate />
            </div>
            <div className={styles.paymentBlock}>
              <span className={styles.paymentCell}>
                Total
                <strong>₹658</strong>
              </span>
              <span className={styles.paymentCell}>
                Paid
                <strong>₹658</strong>
              </span>
              <span className={styles.paymentCell}>
                Due
                <strong>₹0</strong>
              </span>
              <Stamp key={`overlay-${take}`} className={styles.overlayStamp} label="Paid" animate />
            </div>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function LayoutSection() {
  return (
    <Section id="layout" title="Layout" note="Page header, cards, amounts and small parts.">
      <Card>
        <PageHeader
          back={{ to: "/kit", label: "Customers" }}
          title="Rahul Sharma"
          description="98765 43210 · Flat 4, Prabhat Road, Erandwane"
          actions={
            <>
              <Button variant="primary" icon={<Banknote aria-hidden="true" />}>
                Record payment
              </Button>
              <Button icon={<Plus aria-hidden="true" />}>New order</Button>
              <Menu
                label="Customer actions"
                items={[
                  { label: "Edit", icon: <Pencil /> },
                  { label: "Send payment reminder", icon: <MessageCircle /> },
                  { type: "separator" },
                  { label: "Archive", icon: <Archive />, tone: "danger" },
                ]}
              />
            </>
          }
        />
      </Card>
      <div className={styles.grid3}>
        <Card title="Needs attention" description="What to handle first." actions={<ButtonLink to="/kit" size="sm" variant="ghost">View all</ButtonLink>}>
          <DescriptionList
            items={[
              { label: "Due time", value: "Today, 6:30 pm" },
              { label: "Channel", value: "WhatsApp" },
              { label: "Created by", value: "Arjun Pawar" },
              { label: "Address", value: "B-12, Prabhat Road, Erandwane, Pune 411004" },
            ]}
          />
        </Card>
        <Card title="Amounts" footer={<span className="muted">Mono, tabular figures</span>}>
          <div className={styles.stack}>
            <Row>
              <Money value={18450} />
              <Money value={92.5} />
              <Money value={1250} tone="margin" />
              <Money value={1000} tone="leaf" />
              <Money value={null} />
            </Row>
            <Row>
              <Money value={1400} sign="always" />
              <Money value={-1000} sign="always" tone="leaf" />
              <Money value={658} exact />
            </Row>
            <Money value={18450} display />
          </div>
        </Card>
        <Card title="People & keys">
          <div className={styles.stack}>
            <Row>
              <Avatar name="Raj Deshmukh" size="sm" />
              <Avatar name="Sunita Joshi" />
              <Avatar name="Arjun Pawar" size="lg" />
              <Avatar name="Meera Iyer" size="lg" />
            </Row>
            <Row>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
              <Kbd>N</Kbd>
              <Kbd>Esc</Kbd>
            </Row>
          </div>
        </Card>
      </div>
      <Card padding="none" title="Flush card" description="For lists and tables that run edge to edge.">
        <DataTable framed={false} columns={ORDER_COLUMNS.slice(0, 4)} rows={SAMPLE_ORDERS.slice(0, 3)} rowKey={(row) => row.id} />
      </Card>
    </Section>
  );
}

function StatsSection() {
  return (
    <Section id="stats" title="Stats" note="One card divided by rules — never a row of boxed cards.">
      <StatStrip
        items={[
          { label: "Sales today", value: formatMoney(18450), hint: <Trend current={18450} previous={16470} comparison="yesterday" /> },
          { label: "Orders", value: "34", hint: <Trend current={34} previous={36} comparison="yesterday" /> },
          { label: "Received", value: formatMoney(15200), hint: <Trend current={15200} previous={15200} comparison="yesterday" /> },
          { label: "Owed to you", value: formatMoney(18700), tone: "margin", to: "/kit", hint: "across 11 customers" },
        ]}
      />
      <StatStrip
        items={[
          { label: "Sales", value: formatMoney(412300) },
          { label: "Orders", value: "812" },
          { label: "Average order", value: formatMoney(507.75) },
          { label: "Gross profit", value: formatMoney(78340) },
          { label: "Expenses", value: formatMoney(51200), hint: <Trend current={51200} previous={47800} comparison="previous 30 days" invert /> },
          { label: "Net profit", value: formatMoney(27140), tone: "leaf" },
        ]}
      />
      <StatStrip loading items={[{ label: "Sales today", value: "" }, { label: "Orders", value: "" }, { label: "Received", value: "" }]} />
    </Section>
  );
}

const ORDER_COLUMNS: DataColumn<Order>[] = [
  {
    key: "order",
    header: "Order",
    cell: (row) => (
      <span style={{ display: "grid" }}>
        <span className="mono" style={{ fontWeight: 600 }}>
          {orderNo(row.number)}
        </span>
        <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>
          {formatRelative(row.created_at)}
        </span>
      </span>
    ),
  },
  { key: "customer", header: "Customer", cell: (row) => row.customer_name ?? <span className="muted">Walk-in</span> },
  { key: "items", header: "Items", cell: (row) => <span className="muted">{formatItemsSummary(row.items)}</span>, mobile: "hidden" },
  { key: "status", header: "Status", cell: (row) => <OrderStatusBadge status={row.status} /> },
  { key: "payment", header: "Payment", cell: (row) => <PaymentStatusBadge status={row.payment_status} /> },
  { key: "total", header: "Total", align: "right", mobile: "aside", cell: (row) => <Money value={row.total} /> },
  {
    key: "due",
    header: "Due",
    align: "right",
    cell: (row) => (row.outstanding > 0 ? <Money value={row.outstanding} tone="margin" /> : <span className="muted">—</span>),
  },
];

function TableSection() {
  const toast = useToast();
  const [layout, setLayout] = useState<"auto" | "table" | "cards">("auto");
  const [state, setState] = useState<"rows" | "loading" | "empty" | "error">("rows");
  const rows = state === "rows" ? SAMPLE_ORDERS : state === "empty" ? [] : undefined;
  return (
    <Section id="table" title="Table" note="A table from 720px up, stacked cards below. Rows open on click or Enter.">
      <Row>
        <SegmentedControl
          label="Layout"
          size="sm"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "auto", label: "Auto" },
            { value: "table", label: "Table" },
            { value: "cards", label: "Cards" },
          ]}
        />
        <SegmentedControl
          label="State"
          size="sm"
          value={state}
          onChange={setState}
          options={[
            { value: "rows", label: "Rows" },
            { value: "loading", label: "Loading" },
            { value: "empty", label: "Empty" },
            { value: "error", label: "Error" },
          ]}
        />
      </Row>
      <DataTable
        caption="Recent orders"
        layout={layout}
        columns={ORDER_COLUMNS}
        rows={rows}
        loading={state === "loading"}
        error={state === "error" ? new ApiError(0, "Can't reach ShopOS. Check your internet connection and try again.") : undefined}
        onRetry={() => setState("rows")}
        rowKey={(row) => row.id}
        isRowMuted={(row) => row.status === "cancelled"}
        onRowClick={(row) => toast.info(`Order ${orderNo(row.number)} would open in the drawer`)}
        rowActions={(row) => (
          <Menu
            label={`Actions for order ${orderNo(row.number)}`}
            items={[
              { label: "Print receipt", icon: <Printer /> },
              { label: "Send on WhatsApp", icon: <MessageCircle />, disabled: !row.customer_phone, hint: row.customer_phone ? undefined : "No phone number for a walk-in" },
              { type: "separator" },
              { label: "Cancel order", icon: <Trash2 />, tone: "danger" },
            ]}
          />
        )}
        empty={
          <EmptyState
            title="No orders match these filters."
            description="Try another status or clear the search."
            action={<Button onClick={() => setState("rows")}>Clear filters</Button>}
          />
        }
        footer={<LoadMore shown={8} total={231} hasMore loading={false} onLoadMore={() => toast.info("Loading 50 more orders")} noun="orders" />}
      />
    </Section>
  );
}

function FeedbackSection() {
  return (
    <Section id="feedback" title="Feedback" note="Empty states invite the next action; errors say what happened and how to fix it.">
      <div className={styles.grid3}>
        <Card padding="none">
          <EmptyState
            icon={<Truck />}
            title="No pickups waiting."
            description="New orders marked for pickup show up here."
            action={<Button variant="primary" icon={<Plus aria-hidden="true" />}>New order</Button>}
          />
        </Card>
        <Card padding="none">
          <ErrorState error={new ApiError(409, "Void this order's payments before cancelling it.")} onRetry={() => undefined} />
        </Card>
        <Card title="Loading">
          <div className={styles.stack}>
            <Skeleton width="60%" height={20} />
            <SkeletonText lines={3} />
            <Row>
              <Spinner />
              <Spinner size={20} label="Loading orders" />
              <span className="muted">Searching…</span>
            </Row>
          </div>
        </Card>
      </div>
    </Section>
  );
}

function OverlaysSection() {
  const toast = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState<number | null>(1250);
  const [method, setMethod] = useState<PaymentMethod>("upi");

  const submitPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      setModalOpen(false);
      toast.success(`${formatMoney(amount ?? 0)} recorded against #1045 and #1050`);
    }, 700);
  };

  return (
    <Section id="overlays" title="Overlays" note="Focus is trapped, Esc closes, focus returns to the button that opened it.">
      <Card>
        <div className={styles.stack}>
          <Row label="Dialogs">
            <Button onClick={() => setModalOpen(true)}>Record payment</Button>
            <Button onClick={() => setSheetOpen(true)}>Bottom sheet</Button>
            <Button onClick={() => setDrawerOpen(true)}>Order drawer</Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Cancel order
            </Button>
          </Row>
          <Row label="Menus">
            <Menu
              label="Export CSV"
              triggerText="Export CSV"
              align="start"
              items={[
                { type: "label", label: "Download a spreadsheet" },
                { label: "Orders", onSelect: () => toast.info("Orders export started") },
                { label: "Payments", onSelect: () => toast.info("Payments export started") },
                { label: "Customers", onSelect: () => toast.info("Customers export started") },
              ]}
            />
            <Menu
              label="Order actions"
              items={[
                { label: "Move back to Preparing", icon: <ClipboardList /> },
                { label: "Repeat order", icon: <Plus /> },
                { label: "Print receipt", icon: <Printer /> },
                { type: "separator" },
                { label: "Payment reminder", icon: <MessageCircle />, disabled: true, hint: "Add a phone number first" },
                { label: "Cancel order", icon: <Trash2 />, tone: "danger" },
              ]}
            />
          </Row>
          <Row label="Toasts">
            <Button
              onClick={() =>
                toast.success("Order #1046 created", {
                  action: { label: "Open", onClick: () => toast.info("Opening order #1046") },
                  secondaryAction: { label: "Send on WhatsApp", href: "https://wa.me/?text=Namaste", newTab: true },
                })
              }
            >
              Success
            </Button>
            <Button onClick={() => toast.error("Amount is more than the ₹358 due on this order.")}>Error</Button>
            <Button onClick={() => toast.info("ShopOS is installed on this device")}>Info</Button>
          </Row>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record payment"
        description="Rahul Sharma owes ₹1,250. Payments settle the oldest orders first."
        onSubmit={submitPayment}
        footer={
          <>
            <Button onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>
              Record {formatMoney(amount ?? 0)}
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Field label="Amount" error={amount !== null && amount > 1250 ? "Amount is more than the ₹1,250 due." : undefined}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Field label="Method">
            <SegmentedControl block value={method} onChange={setMethod} options={toOptions(METHOD_SHORT_LABEL)} />
          </Field>
          <Field label="Note" optional>
            <Input placeholder="Paid at the counter" />
          </Field>
        </div>
      </Modal>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="More" placement="bottom">
        <p className="muted">Bottom sheets hold secondary navigation and quick choices on phones.</p>
      </Modal>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={<span className="mono">#1045</span>}
        description="Created 12 min ago · WhatsApp · Pickup"
        headerActions={<Menu label="Order actions" items={[{ label: "Print receipt", icon: <Printer /> }, { label: "Repeat order", icon: <Plus /> }]} />}
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>Close</Button>
            <Button variant="primary">Collect ₹658</Button>
          </>
        }
      >
        <div className={styles.stack}>
          <Row>
            <OrderStatusBadge status="ready" />
            <PaymentStatusBadge status="unpaid" />
          </Row>
          <DescriptionList
            items={SAMPLE_ORDERS[0].items.map((line) => ({
              key: String(line.id),
              label: `${formatQty(line.quantity, line.unit)} × ${formatMoney(line.unit_price)}`,
              value: (
                <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  {line.name}
                  <Money value={lineTotal(line.quantity, line.unit_price, line.discount)} />
                </span>
              ),
            }))}
          />
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmError(null);
        }}
        onConfirm={() => setConfirmError("Void this order's payments before cancelling it.")}
        title="Cancel order #1045?"
        description="Stock isn't touched because the order wasn't handed over."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        error={confirmError}
      />
    </Section>
  );
}

function ChartsSection() {
  return (
    <Section id="charts" title="Charts" note="Thin marks, hairline grid, today in pen. Hover or focus a chart, then use ← →.">
      <div className={styles.grid2}>
        <Card title="This week" description={`${formatMoney(SALES_7D.reduce((sum, day) => sum + day.value, 0))} in sales`} className={styles.chartCard}>
          <ColumnChart data={SALES_7D} label="Sales, last 7 days" periodLabel="Day" valueLabel="Sales" />
        </Card>
        <Card title="Last 30 days" className={styles.chartCard}>
          <ColumnChart data={SALES_30D} label="Sales, last 30 days" height={180} periodLabel="Day" valueLabel="Sales" />
        </Card>
        <Card title="By method (this month)">
          <BarList items={PAYMENTS_BY_METHOD} label="Payments by method" />
        </Card>
        <Card title="Small parts">
          <div className={styles.stack}>
            <Row label="Sparkline">
              <Sparkline values={SALES_30D.map((day) => day.value)} label="Sales over 30 days, rising at weekends" />
              <Sparkline values={[9, 8, 8, 6, 5, 5, 3]} tone="margin" label="Stock falling" />
            </Row>
            {SAMPLE_PRODUCTS.slice(0, 4).map((product) => (
              <Row key={product.id} label={product.name}>
                <StockMeter
                  stock={product.stock_quantity}
                  min={product.min_stock_level}
                  unit={product.unit}
                  label={
                    product.stock_quantity <= 0
                      ? "Out of stock"
                      : `${formatQty(product.stock_quantity, product.unit)} left · min ${formatQty(product.min_stock_level, product.unit)}`
                  }
                />
              </Row>
            ))}
          </div>
        </Card>
      </div>
    </Section>
  );
}

export default function KitPage() {
  useDocumentTitle("UI kit");
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Logo />
          <nav className={styles.nav} aria-label="Kit sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`}>
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className={styles.main}>
        <PageHeader
          title="ShopOS UI kit"
          description="Every component and state in one place, for design QA. Development builds only."
        />
        <TokensSection />
        <ButtonsSection />
        <FormsSection />
        <ChoicesSection />
        <PickersSection />
        <StatusSection />
        <StampSection />
        <LayoutSection />
        <StatsSection />
        <TableSection />
        <FeedbackSection />
        <OverlaysSection />
        <ChartsSection />
      </main>
    </div>
  );
}
