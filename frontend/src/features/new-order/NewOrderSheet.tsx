import { Check, CircleAlert, Plus, RotateCcw, UserRound } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  Button,
  Chip,
  ConfirmDialog,
  Drawer,
  Field,
  Kbd,
  Money,
  MoneyInput,
  SegmentedControl,
  Skeleton,
  Switch,
  Textarea,
  useToast,
} from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { CHANNEL_LABEL, completedStatusFor, FULFILLMENT_LABEL, METHOD_SHORT_LABEL, toOptions } from "../../lib/constants";
import { firstName, formatMoney, orderNo, pluralize } from "../../lib/format";
import { modifierKeyLabel, useHotkey, useMediaQuery } from "../../lib/hooks";
import { fromPaise, toPaise } from "../../lib/money";
import { useCreateOrder, useCustomer, useOrders, useProducts } from "../../lib/queries";
import type { Channel, Customer, Fulfillment, OrderCreate, OrderDetail, OrderItemInput, PaymentMethod } from "../../lib/types";
import { hasWhatsAppNumber, orderConfirmationMessage, receiptMessage, waLink } from "../../lib/whatsapp";
import { lastPaymentMethod, rememberPaymentMethod } from "../order-drawer/orderFlow";
import { useOrderDrawer } from "../order-drawer/OrderDrawerProvider";
import { CustomerPicker } from "../pickers/CustomerPicker";
import { DueTimeField } from "./DueTimeField";
import { LineItemsEditor } from "./LineItemsEditor";
import type { NewOrderInitial } from "./NewOrderProvider";
import styles from "./NewOrderSheet.module.css";
import {
  draftTotals,
  linesForItems,
  mergeLines,
  repeatItemsOf,
  skippedItemsMessage,
  toItemInputs,
  validateLines,
  type DraftLine,
} from "./orderDraft";

export interface NewOrderSheetProps {
  open: boolean;
  initial?: NewOrderInitial;
  onClose: () => void;
}

type CustomerChoice =
  | { kind: "unset" }
  | { kind: "loading"; id: number }
  | { kind: "walk_in" }
  | { kind: "customer"; customer: Customer };

/** How much is being paid now: the whole total (follows the total as items change), nothing, or a typed amount. */
type PaidMode = "full" | "none" | "custom";

// "Online" is only for orders customers send through their khata link.
const CHANNEL_OPTIONS = toOptions(CHANNEL_LABEL, ["walk_in", "phone", "whatsapp"]);
const FULFILLMENT_OPTIONS = toOptions(FULFILLMENT_LABEL);
const METHOD_OPTIONS = toOptions(METHOD_SHORT_LABEL);

// The customer picker's inline "New customer" form: Ctrl+Enter there must not create the order.
const NEW_CUSTOMER_FORM = '[role="group"][aria-label="New customer"]';

function defaultHandover(channel: Channel, fulfillment: Fulfillment): boolean {
  return channel === "walk_in" && fulfillment === "pickup";
}

function defaultPaidMode(channel: Channel): PaidMode {
  return channel === "walk_in" ? "full" : "none";
}

/**
 * The new order sheet: customer, items, how it goes out, payment. Keyboard-first: the customer
 * search has focus on open, choosing one moves to the product search, Ctrl+Enter creates the order.
 * It is remounted for every open, so its state always starts from `initial`.
 */
export default function NewOrderSheet({ open, initial, onClose }: NewOrderSheetProps) {
  const toast = useToast();
  const { shop } = useAuth();
  const { openOrder } = useOrderDrawer();
  const createOrder = useCreateOrder();
  const products = useProducts();
  // Autofocus only with a mouse or trackpad: on phones it would throw up the keyboard over the sheet.
  const finePointer = useMediaQuery("(pointer: fine)");
  const baseId = useId();
  const sectionId = (name: string) => `${baseId}-${name}`;

  const bodyRef = useRef<HTMLDivElement>(null);
  const customerInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const walkInButtonRef = useRef<HTMLButtonElement>(null);

  const startChannel = initial?.channel ?? "walk_in";
  const startFulfillment = initial?.fulfillment ?? "pickup";

  // ---- Customer -----------------------------------------------------------

  const [choice, setChoice] = useState<CustomerChoice>(() =>
    initial?.customerId != null ? { kind: "loading", id: initial.customerId } : { kind: "unset" },
  );
  const [customerNotice, setCustomerNotice] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [addressEdited, setAddressEdited] = useState(false);
  const initialCustomer = useCustomer(choice.kind === "loading" ? choice.id : null);

  const applyCustomer = (next: Customer) => {
    setChoice({ kind: "customer", customer: next });
    setCustomerNotice(null);
    if (!addressEdited) setAddress(next.address);
  };

  if (choice.kind === "loading") {
    if (initialCustomer.data) {
      applyCustomer(initialCustomer.data);
    } else if (initialCustomer.isError) {
      setChoice({ kind: "unset" });
      setCustomerNotice(`The customer didn't load (${errorMessage(initialCustomer.error)}) Search for them again, or sell as walk-in.`);
    }
  }

  const customer = choice.kind === "customer" ? choice.customer : null;

  const focusProducts = () => window.requestAnimationFrame(() => productInputRef.current?.focus());

  // ---- Items --------------------------------------------------------------

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [pendingItems, setPendingItems] = useState<OrderItemInput[] | null>(() =>
    initial?.items && initial.items.length > 0 ? initial.items : null,
  );
  const [itemsNotice, setItemsNotice] = useState<string | null>(null);
  const productsById = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product] as const)),
    [products.data],
  );

  // Prefilled items need product names, units and prices, so they become lines once products load.
  if (pendingItems) {
    if (products.data) {
      const { lines: prefilled, skipped } = linesForItems(pendingItems, productsById);
      setLines(prefilled);
      setPendingItems(null);
      setItemsNotice(skippedItemsMessage(skipped));
    } else if (products.isError) {
      setPendingItems(null);
      setItemsNotice(`Products didn't load, so the items weren't added. ${errorMessage(products.error)}`);
    }
  }

  const recentOrders = useOrders(customer ? { customer_id: customer.id, limit: 5 } : { limit: 5 }, {
    enabled: customer !== null && customer.orders_count > 0,
  });
  const lastOrder =
    customer && !recentOrders.isPlaceholderData
      ? recentOrders.data?.items.find((order) => order.status !== "cancelled" && order.customer_id === customer.id)
      : undefined;
  const [repeatedFrom, setRepeatedFrom] = useState<number | null>(null);

  const repeatLastOrder = () => {
    if (!lastOrder || !products.data) return;
    const { lines: repeated, skipped } = linesForItems(repeatItemsOf(lastOrder.items), productsById);
    setLines((current) => mergeLines(current, repeated));
    setRepeatedFrom(lastOrder.id);
    setItemsNotice(skippedItemsMessage(skipped));
    focusProducts();
  };

  // ---- How ----------------------------------------------------------------

  const [channel, setChannel] = useState<Channel>(startChannel);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(startFulfillment);
  const [handover, setHandover] = useState(() => defaultHandover(startChannel, startFulfillment));
  const [dueAt, setDueAt] = useState<string | null>(null);

  // ---- Payment ------------------------------------------------------------

  const [paidMode, setPaidMode] = useState<PaidMode>(() => defaultPaidMode(startChannel));
  const [paidCustom, setPaidCustom] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(lastPaymentMethod);

  const changeChannel = (next: Channel) => {
    setChannel(next);
    setHandover(defaultHandover(next, fulfillment));
    if (paidMode !== "custom") setPaidMode(defaultPaidMode(next));
  };

  const changeFulfillment = (next: Fulfillment) => {
    setFulfillment(next);
    setHandover(defaultHandover(channel, next));
    if (next === "delivery" && customer && !addressEdited) setAddress(customer.address);
  };

  // ---- Discount and note --------------------------------------------------

  const [extrasOpen, setExtrasOpen] = useState(false);
  const [orderDiscount, setOrderDiscount] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // ---- Totals and checks --------------------------------------------------

  const totals = draftTotals(lines, orderDiscount ?? 0);
  const totalPaise = Math.max(toPaise(totals.total), 0);
  const paidPaise = paidMode === "full" ? totalPaise : paidMode === "none" ? 0 : toPaise(paidCustom ?? 0);
  const paidNow = fromPaise(paidPaise);
  const toKhata = fromPaise(Math.max(totalPaise - paidPaise, 0));

  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const lineIssues = validateLines(lines);
  const itemsError = lines.length === 0 ? "Add at least one item." : null;
  const discountError = toPaise(orderDiscount ?? 0) > toPaise(totals.subtotal) ? "The discount is more than the subtotal." : null;
  const paidError = paidPaise > totalPaise ? `That's more than the total of ${formatMoney(fromPaise(totalPaise))}.` : null;
  const creditError = !customer && lines.length > 0 && paidPaise < totalPaise ? "Add a customer to sell on credit." : null;

  const completeLabel = fulfillment === "delivery" ? "Mark delivered now" : "Hand over now (mark collected)";
  const submitLabel = handover
    ? fulfillment === "delivery"
      ? "Create & mark delivered"
      : "Create & mark collected"
    : "Create order";

  const focusFirstInvalid = () => {
    window.requestAnimationFrame(() => {
      bodyRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    });
  };

  const announceCreated = (order: OrderDetail) => {
    const completed = order.status === "collected" || order.status === "delivered";
    const parts: string[] = [];
    if (completed) parts.push(order.status === "collected" ? "Marked collected" : "Marked delivered");
    if (order.outstanding > 0 && order.customer_name) {
      parts.push(`${formatMoney(order.outstanding)} added to ${firstName(order.customer_name)}'s khata`);
    }
    const phone = order.customer_phone;
    toast.success(`Order ${orderNo(order.number)} created`, {
      description: parts.length > 0 ? parts.join(" · ") : undefined,
      action: { label: "Open", onClick: () => openOrder(order.id) },
      secondaryAction:
        shop && hasWhatsAppNumber(phone)
          ? {
              label: completed ? "Send receipt on WhatsApp" : "Send on WhatsApp",
              href: waLink(phone, completed ? receiptMessage(order, shop) : orderConfirmationMessage(order, shop)),
              newTab: true,
            }
          : undefined,
    });
  };

  const submit = async () => {
    if (createOrder.isPending || pendingItems) return;
    setShowErrors(true);
    setSubmitError(null);
    if (itemsError) {
      productInputRef.current?.focus();
      return;
    }
    if (Object.keys(lineIssues).length > 0 || discountError || paidError) {
      focusFirstInvalid();
      return;
    }
    if (creditError) {
      if (choice.kind === "walk_in") walkInButtonRef.current?.focus();
      else customerInputRef.current?.focus();
      return;
    }

    const body: OrderCreate = {
      customer_id: customer?.id ?? null,
      items: toItemInputs(lines),
      fulfillment,
      channel,
      status: handover ? completedStatusFor(fulfillment) : "new",
      due_at: handover ? null : dueAt,
      delivery_address: fulfillment === "delivery" ? address.trim() : undefined,
      notes: notes.trim() || undefined,
      discount: orderDiscount !== null && orderDiscount > 0 ? orderDiscount : undefined,
      payment: paidPaise > 0 ? { amount: paidNow, method } : null,
    };

    try {
      const order = await createOrder.mutateAsync(body);
      if (paidPaise > 0) rememberPaymentMethod(method);
      announceCreated(order);
      onClose();
    } catch (error) {
      setSubmitError(errorMessage(error));
    }
  };

  const requestClose = () => {
    if (createOrder.isPending) return;
    if (lines.length > 0) setConfirmDiscard(true);
    else onClose();
  };

  useHotkey(
    "mod+enter",
    (event) => {
      if (event.target instanceof Element && event.target.closest(NEW_CUSTOMER_FORM)) return;
      void submit();
    },
    { enabled: open && !confirmDiscard, allowInInputs: true },
  );

  const footerError = submitError ?? creditError;

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title="New order"
        width={640}
        bodyClassName={styles.drawerBody}
        footer={
          <div className={styles.footer}>
            <div className={styles.summary}>
              {totals.discount > 0 && (
                <p className={styles.subline}>
                  Subtotal <Money value={totals.subtotal} size="sm" /> · Discount <Money value={-totals.discount} size="sm" />
                </p>
              )}
              <p className={styles.totalLine}>
                <span className={styles.totalLabel}>Total</span>
                <Money value={totals.total} display className={styles.totalAmount} />
              </p>
              <p className={styles.subline}>
                Paid now <Money value={paidNow} size="sm" />
                {customer && toPaise(toKhata) > 0 && (
                  <span className={styles.khata}>
                    {" · "}To khata <Money value={toKhata} size="sm" tone="margin" />
                  </span>
                )}
              </p>
            </div>
            <div className={styles.footerActions}>
              <span className={styles.shortcut} aria-hidden="true">
                <Kbd>{modifierKeyLabel()}</Kbd>
                <Kbd>Enter</Kbd>
              </span>
              <Button
                variant="primary"
                size="lg"
                className={styles.submit}
                loading={createOrder.isPending}
                onClick={() => void submit()}
                aria-keyshortcuts="Control+Enter Meta+Enter"
              >
                {submitLabel}
              </Button>
            </div>
            {footerError && (
              <p className={styles.footerError} role="alert">
                <CircleAlert aria-hidden="true" />
                <span>{footerError}</span>
              </p>
            )}
          </div>
        }
      >
        <div ref={bodyRef} className={styles.body}>
          {/* 1. Customer */}
          <section className={styles.section} aria-labelledby={sectionId("customer")}>
            <h3 id={sectionId("customer")} className={styles.sectionTitle}>
              Customer
            </h3>
            {choice.kind === "loading" ? (
              <Skeleton height={52} radius={10} />
            ) : choice.kind === "walk_in" ? (
              <div className={styles.walkIn}>
                <span className={styles.walkInIcon} aria-hidden="true">
                  <UserRound />
                </span>
                <span className={styles.walkInText}>
                  <span className={styles.walkInTitle}>Walk-in customer</span>
                  <span className={styles.walkInHint}>No khata, so collect the full amount now.</span>
                </span>
                <Button
                  ref={walkInButtonRef}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setChoice({ kind: "unset" });
                    window.requestAnimationFrame(() => customerInputRef.current?.focus());
                  }}
                >
                  Add customer
                </Button>
              </div>
            ) : (
              <CustomerPicker
                value={customer}
                onChange={(next) => {
                  if (next) {
                    applyCustomer(next);
                    setRepeatedFrom(null);
                    focusProducts();
                  } else {
                    setChoice({ kind: "unset" });
                  }
                }}
                allowWalkIn
                onWalkIn={() => {
                  setChoice({ kind: "walk_in" });
                  setCustomerNotice(null);
                  focusProducts();
                }}
                autoFocus={finePointer && initial?.customerId == null}
                inputRef={customerInputRef}
                invalid={showErrors && creditError !== null && choice.kind === "unset"}
              />
            )}
            {customerNotice && <p className={styles.notice}>{customerNotice}</p>}
            {customer && lastOrder && (
              <div className={styles.chips}>
                {repeatedFrom === lastOrder.id ? (
                  <span className={styles.done}>
                    <Check aria-hidden="true" />
                    Items from {orderNo(lastOrder.number)} added
                  </span>
                ) : (
                  <Chip icon={<RotateCcw aria-hidden="true" />} onClick={repeatLastOrder} disabled={!products.data}>
                    Repeat last order ({orderNo(lastOrder.number)} · {formatMoney(lastOrder.total)})
                  </Chip>
                )}
              </div>
            )}
          </section>

          {/* 2. Items */}
          <section className={styles.section} aria-labelledby={sectionId("items")}>
            <h3 id={sectionId("items")} className={styles.sectionTitle}>
              Items
              {lines.length > 0 && <span className={styles.sectionCount}>{lines.length}</span>}
            </h3>
            {pendingItems ? (
              <div className={styles.itemsLoading} aria-busy="true">
                <Skeleton height={44} radius={10} />
                <Skeleton height={44} radius={10} />
              </div>
            ) : (
              <LineItemsEditor
                lines={lines}
                setLines={setLines}
                issues={showErrors ? lineIssues : undefined}
                pickerRef={productInputRef}
                pickerAutoFocus={finePointer && initial?.customerId != null}
                pickerError={showErrors ? itemsError : null}
                label="Order items"
              />
            )}
            {itemsNotice && <p className={styles.notice}>{itemsNotice}</p>}
          </section>

          {/* 3. How */}
          <section className={styles.section} aria-labelledby={sectionId("how")}>
            <h3 id={sectionId("how")} className={styles.sectionTitle}>
              How
            </h3>
            <div className={styles.twoUp}>
              <Field label="Order via">
                <SegmentedControl options={CHANNEL_OPTIONS} value={channel} onChange={changeChannel} size="sm" block />
              </Field>
              <Field label="Pickup or delivery">
                <SegmentedControl options={FULFILLMENT_OPTIONS} value={fulfillment} onChange={changeFulfillment} size="sm" block />
              </Field>
            </div>
            {fulfillment === "delivery" && (
              <Field
                label="Delivery address"
                optional
                hint={customer?.address ? "From the customer's details. Changes apply to this order only." : undefined}
              >
                <Textarea
                  rows={2}
                  value={address}
                  maxLength={500}
                  placeholder="House, street, landmark"
                  onChange={(event) => {
                    setAddress(event.target.value);
                    setAddressEdited(true);
                  }}
                />
              </Field>
            )}
            {!handover && (
              <DueTimeField
                label={fulfillment === "delivery" ? "Delivery time" : "Pickup time"}
                value={dueAt}
                onChange={setDueAt}
              />
            )}
          </section>

          {/* 4. Payment */}
          <section className={styles.section} aria-labelledby={sectionId("payment")}>
            <h3 id={sectionId("payment")} className={styles.sectionTitle}>
              Payment
            </h3>
            <Field label="Paid now" error={showErrors ? paidError : undefined}>
              <div className={styles.paidRow}>
                <MoneyInput
                  wrapperClassName={styles.paidInput}
                  value={paidNow}
                  onChange={(value) => {
                    setPaidMode("custom");
                    setPaidCustom(value);
                  }}
                />
                <div className={styles.paidChips} role="group" aria-label="Quick amounts">
                  <Chip selected={paidMode === "full"} onClick={() => setPaidMode("full")}>
                    {totalPaise > 0 ? `Full ${formatMoney(fromPaise(totalPaise))}` : "Full amount"}
                  </Chip>
                  <Chip selected={paidPaise === 0 && paidMode !== "full"} onClick={() => setPaidMode("none")}>
                    None
                  </Chip>
                </div>
              </div>
            </Field>
            <Field label="Paid by">
              <SegmentedControl options={METHOD_OPTIONS} value={method} onChange={setMethod} size="sm" block disabled={paidPaise === 0} />
            </Field>
            <Switch
              checked={handover}
              onCheckedChange={setHandover}
              label={completeLabel}
              description={
                fulfillment === "delivery"
                  ? "The items have already reached the customer. Stock is updated now."
                  : "The customer is taking the items now. Stock is updated now."
              }
            />
          </section>

          {/* 5. Discount and note */}
          {extrasOpen ? (
            <section className={styles.section} aria-labelledby={sectionId("extras")}>
              <h3 id={sectionId("extras")} className={styles.sectionTitle}>
                Discount and note
              </h3>
              <div className={styles.twoUp}>
                <Field label="Order discount" optional hint="Taken off the subtotal." error={showErrors ? discountError : undefined}>
                  <MoneyInput ref={discountInputRef} value={orderDiscount} onChange={setOrderDiscount} />
                </Field>
              </div>
              <Field label="Note" optional>
                <Textarea
                  rows={2}
                  value={notes}
                  maxLength={2000}
                  placeholder="For example: pack the dal separately, call before delivering"
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            </section>
          ) : (
            <div className={styles.disclosureRow}>
              <button
                type="button"
                className={styles.disclosure}
                aria-expanded={false}
                onClick={() => {
                  setExtrasOpen(true);
                  window.requestAnimationFrame(() => discountInputRef.current?.focus());
                }}
              >
                <Plus aria-hidden="true" />
                Add discount or note
              </button>
            </div>
          )}
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard this order?"
        description={`The ${pluralize(lines.length, "item")} you added will be lost.`}
        confirmLabel="Discard order"
        cancelLabel="Keep editing"
      />
    </>
  );
}
