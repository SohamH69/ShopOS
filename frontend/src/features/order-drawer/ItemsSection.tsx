import { Pencil } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Button, Field, Money, MoneyInput, useToast } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { isOpenStatus } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatMoney, formatQty, orderNo } from "../../lib/format";
import { toPaise } from "../../lib/money";
import { useUpdateOrder } from "../../lib/queries";
import type { Order } from "../../lib/types";
import { LineItemsEditor } from "../new-order/LineItemsEditor";
import {
  draftTotals,
  linesFromOrderItems,
  sameItems,
  toItemInputs,
  validateLines,
  type DraftLine,
} from "../new-order/orderDraft";
import styles from "./OrderDrawer.module.css";

/** The order's lines and totals; "Edit items" while the order is still open. */
export function ItemsSection({ order }: { order: Order }) {
  const headingId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const editable = isOpenStatus(order.status);
  const [editing, setEditing] = useState(false);
  // Someone completed or cancelled the order meanwhile: its items are locked now.
  if (editing && !editable) setEditing(false);

  const finishEditing = () => {
    setEditing(false);
    window.requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h3 id={headingId} className={styles.sectionTitle}>
          Items
          <span className={styles.count}>{order.items.length}</span>
        </h3>
        {editable && !editing && (
          <Button ref={editButtonRef} size="sm" variant="ghost" icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(true)}>
            Edit items
          </Button>
        )}
      </div>
      {editing ? <ItemsEditor order={order} onDone={finishEditing} /> : <ItemsView order={order} />}
    </section>
  );
}

function ItemsView({ order }: { order: Order }) {
  return (
    <>
      <ul className={styles.items}>
        {order.items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span className={styles.itemName}>{item.name}</span>
            <Money value={item.line_total} className={styles.itemTotal} />
            <span className={styles.itemMeta}>
              <span className="mono">
                {formatQty(item.quantity, item.unit)} × {formatMoney(item.unit_price)}
              </span>
              {item.discount > 0 && <span> · {formatMoney(item.discount)} off</span>}
              {item.product_id === null && <span> · custom item</span>}
            </span>
          </li>
        ))}
      </ul>
      <dl className={styles.totals}>
        {order.discount > 0 && (
          <>
            <div className={styles.totalsRow}>
              <dt>Subtotal</dt>
              <dd>
                <Money value={order.subtotal} />
              </dd>
            </div>
            <div className={styles.totalsRow}>
              <dt>Order discount</dt>
              <dd>
                <Money value={-order.discount} />
              </dd>
            </div>
          </>
        )}
        <div className={cx(styles.totalsRow, styles.grandTotal)}>
          <dt>Total</dt>
          <dd>
            <Money value={order.total} />
          </dd>
        </div>
      </dl>
    </>
  );
}

function ItemsEditor({ order, onDone }: { order: Order; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdateOrder();
  const [original] = useState<DraftLine[]>(() => linesFromOrderItems(order.items));
  const [lines, setLines] = useState<DraftLine[]>(original);
  const [discount, setDiscount] = useState<number | null>(order.discount > 0 ? order.discount : null);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totals = draftTotals(lines, discount ?? 0);
  const issues = validateLines(lines);
  const emptyError = lines.length === 0 ? "An order needs at least one item. To drop the whole order, cancel it from the menu." : null;
  const discountError = toPaise(discount ?? 0) > toPaise(totals.subtotal) ? "The discount is more than the subtotal." : null;
  const belowPaid =
    toPaise(totals.total) < toPaise(order.paid)
      ? `The new total ${formatMoney(totals.total)} is less than the ${formatMoney(order.paid)} already paid. Void a payment first.`
      : null;
  const walkInRaise =
    order.customer_id === null && toPaise(totals.total) > toPaise(order.paid)
      ? "This walk-in order is paid in full, so its total can't go up. Take the extra items as a new order."
      : null;
  const unchanged = sameItems(lines, original) && toPaise(discount ?? 0) === toPaise(order.discount);
  const blockingMessage = saveError ?? belowPaid ?? walkInRaise;

  const save = async () => {
    setShowErrors(true);
    setSaveError(null);
    if (unchanged) {
      onDone();
      return;
    }
    if (emptyError || Object.keys(issues).length > 0 || discountError || belowPaid || walkInRaise) return;
    try {
      const updated = await update.mutateAsync({ id: order.id, items: toItemInputs(lines), discount: discount ?? 0 });
      toast.success("Items saved", { description: `${orderNo(updated.number)} · total now ${formatMoney(updated.total)}` });
      onDone();
    } catch (caught) {
      setSaveError(errorMessage(caught));
    }
  };

  // Esc cancels the edit (not the whole drawer), unless an open list or menu already used it.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented && !update.isPending) {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <div className={styles.editor} onKeyDown={handleKeyDown}>
      <LineItemsEditor
        lines={lines}
        setLines={setLines}
        issues={showErrors ? issues : undefined}
        pickerError={showErrors ? emptyError : null}
        label={`Items on order ${orderNo(order.number)}`}
      />
      <div className={styles.editorTotals}>
        <Field label="Order discount" optional error={showErrors ? discountError : undefined} className={styles.discountField}>
          <MoneyInput value={discount} onChange={setDiscount} />
        </Field>
        <p className={styles.editorTotal}>
          <span>New total</span>
          <Money value={totals.total} size="lg" />
        </p>
      </div>
      {blockingMessage && (
        <p className={styles.formError} role="alert">
          {blockingMessage}
        </p>
      )}
      <div className={styles.editActions}>
        <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} loading={update.isPending}>
          Save items
        </Button>
      </div>
    </div>
  );
}
