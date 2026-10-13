import { CircleAlert, ShoppingBasket, Trash2 } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { Button, EmptyState, Field, IconButton, Modal, Money, QuantityInput, SegmentedControl, Textarea } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { formatMoney, pluralize } from "../../lib/format";
import type { Fulfillment } from "../../lib/types";
import styles from "./CheckoutSheet.module.css";
import { MAX_LINE_QUANTITY, priceSuffix, quantityStep, type CartLine } from "./portalModel";

const FULFILLMENT_OPTIONS: { value: Fulfillment; label: string }[] = [
  { value: "pickup", label: "Pick up at shop" },
  { value: "delivery", label: "Deliver to me" },
];

export interface CheckoutSheetProps {
  open: boolean;
  onClose: () => void;
  shopName: string;
  lines: readonly CartLine[];
  total: number;
  onSetQuantity: (productId: number, quantity: number) => void;
  fulfillment: Fulfillment;
  onFulfillmentChange: (value: Fulfillment) => void;
  address: string;
  onAddressChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  /** The last failed attempt (its API message is shown). */
  error: unknown;
}

/** Review the cart, choose pickup or delivery, add a note, and send the order to the shop. */
export function CheckoutSheet({
  open,
  onClose,
  shopName,
  lines,
  total,
  onSetQuantity,
  fulfillment,
  onFulfillmentChange,
  address,
  onAddressChange,
  notes,
  onNotesChange,
  onSend,
  sending,
  error,
}: CheckoutSheetProps) {
  const empty = lines.length === 0;
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The sheet scrolls; make sure the reason a send failed is on screen.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!empty && !sending) onSend();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your order"
      description={`From ${shopName}`}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={sending}>
            Keep shopping
          </Button>
          <Button type="submit" variant="primary" loading={sending} disabled={empty}>
            Send order{empty ? "" : ` · ${formatMoney(total)}`}
          </Button>
        </>
      }
    >
      {empty ? (
        <EmptyState
          compact
          icon={<ShoppingBasket />}
          title="Your order is empty."
          description="Add products from the shop's list, then send them from here."
        />
      ) : (
        <div className={styles.sheet}>
          <ul className={styles.lines} aria-label={pluralize(lines.length, "item")}>
            {lines.map((line) => (
              <li key={line.product.id} className={styles.line}>
                <div className={styles.lineInfo}>
                  <p className={styles.lineName}>{line.product.name}</p>
                  <p className={styles.linePrice}>
                    {formatMoney(line.product.price)}
                    {priceSuffix(line.product.unit)}
                  </p>
                </div>
                <Money value={line.total} className={styles.lineTotal} />
                <div className={styles.lineControls}>
                  <QuantityInput
                    value={line.quantity}
                    onChange={(next) => onSetQuantity(line.product.id, next)}
                    step={quantityStep(line.product.unit)}
                    min={quantityStep(line.product.unit)}
                    max={MAX_LINE_QUANTITY}
                    unit={line.product.unit}
                    size="sm"
                    aria-label={`Quantity of ${line.product.name}`}
                  />
                  <IconButton
                    label={`Remove ${line.product.name}`}
                    icon={<Trash2 aria-hidden="true" />}
                    size="sm"
                    onClick={() => onSetQuantity(line.product.id, 0)}
                  />
                </div>
              </li>
            ))}
          </ul>

          <div className={styles.totalRow}>
            <span className={styles.totalLabel}>Total</span>
            <Money value={total} display className={styles.total} />
          </div>
          <p className={styles.totalNote}>
            {fulfillment === "delivery"
              ? "Pay when it's delivered, or by UPI from this page. The shop confirms prices when they pack it."
              : "Pay when you pick it up, or by UPI from this page. The shop confirms prices when they pack it."}
          </p>

          <Field label="How do you want it?">
            <SegmentedControl options={FULFILLMENT_OPTIONS} value={fulfillment} onChange={onFulfillmentChange} block />
          </Field>

          {fulfillment === "delivery" && (
            <Field label="Delivery address" optional hint="Leave it empty to use the address the shop has for you.">
              <Textarea
                rows={2}
                value={address}
                maxLength={500}
                autoComplete="street-address"
                onChange={(event) => onAddressChange(event.target.value)}
              />
            </Field>
          )}

          <Field label="Note for the shop" optional>
            <Textarea
              rows={2}
              value={notes}
              maxLength={2000}
              placeholder="For example: the 5 kg bag of atta, not 10 kg"
              onChange={(event) => onNotesChange(event.target.value)}
            />
          </Field>

          {Boolean(error) && (
            <p ref={errorRef} role="alert" className={styles.error}>
              <CircleAlert aria-hidden="true" />
              <span>{errorMessage(error, "Your order didn't send. Check your internet connection and try again.")}</span>
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
