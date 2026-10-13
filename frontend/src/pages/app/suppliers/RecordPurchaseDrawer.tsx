import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Chip,
  ConfirmDialog,
  Drawer,
  Field,
  IconButton,
  Input,
  Money,
  MoneyInput,
  QuantityInput,
  SegmentedControl,
  useToast,
} from "../../../components/ui";
import { ProductPicker } from "../../../features/pickers/ProductPicker";
import { errorMessage } from "../../../lib/api";
import { METHOD_SHORT_LABEL, toOptions, unitStep } from "../../../lib/constants";
import { formatMoney, pluralize } from "../../../lib/format";
import { modifierKeyLabel, useHotkey } from "../../../lib/hooks";
import { lineTotal, roundMoney, roundQty, sumMoney } from "../../../lib/money";
import { useCreatePurchase } from "../../../lib/queries";
import type { PaymentMethod, Product, Supplier } from "../../../lib/types";
import { FormError } from "../products/FormError";
import { perUnitLabel } from "../products/stock";
import { StockChange } from "../products/StockChange";
import styles from "./RecordPurchaseDrawer.module.css";

const METHOD_OPTIONS = toOptions(METHOD_SHORT_LABEL);

interface PurchaseLine {
  product: Product;
  quantity: number;
  /** Rupees per unit; null while the field is empty. */
  unitCost: number | null;
}

/** First quantity for a new line: one whole unit (or one step for grams and millilitres). */
function startingQuantity(product: Product): number {
  return Math.max(1, unitStep(product.unit));
}

function lineProblem(line: PurchaseLine): string | undefined {
  if (!(line.quantity > 0)) return "Enter how much came in.";
  if (line.unitCost === null) return "Enter what it cost.";
  return undefined;
}

export interface RecordPurchaseDrawerProps {
  supplier: Supplier;
  open: boolean;
  onClose: () => void;
}

/**
 * Stock in from a supplier: pick products, enter quantity and cost (each line previews the stock
 * before → after), optionally pay now, and update buy prices to these costs.
 */
export function RecordPurchaseDrawer({ supplier, open, onClose }: RecordPurchaseDrawerProps) {
  const toast = useToast();
  const createPurchase = useCreatePurchase();
  const pickerRef = useRef<HTMLInputElement>(null);
  const itemsHeadingId = useId();

  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [paid, setPaid] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [updatePrices, setUpdatePrices] = useState(true);
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const total = sumMoney(lines.map((line) => lineTotal(line.quantity, line.unitCost ?? 0)));
  const paidNow = paid ?? 0;
  const owedAfter = roundMoney(supplier.outstanding + total - paidNow);
  const inPurchase = useMemo(
    () => Object.fromEntries(lines.map((line) => [line.product.id, line.quantity])) as Record<number, number>,
    [lines],
  );

  const noLines = lines.length === 0;
  const paidProblem = paidNow > total ? `Paid now is more than the ${formatMoney(total)} total.` : undefined;
  const hasProblems = noLines || lines.some((line) => lineProblem(line) !== undefined) || paidProblem !== undefined;

  const addProduct = (product: Product) => {
    setFormError(null);
    setLines((current) => {
      if (current.some((line) => line.product.id === product.id)) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: roundQty(line.quantity + startingQuantity(product)) } : line,
        );
      }
      return [...current, { product, quantity: startingQuantity(product), unitCost: product.purchase_price }];
    });
  };

  const updateLine = (productId: number, patch: Partial<Pick<PurchaseLine, "quantity" | "unitCost">>) => {
    setFormError(null);
    setLines((current) => current.map((line) => (line.product.id === productId ? { ...line, ...patch } : line)));
  };

  const removeLine = (productId: number) => {
    setLines((current) => current.filter((line) => line.product.id !== productId));
    pickerRef.current?.focus();
  };

  const requestClose = () => {
    if (createPurchase.isPending) return;
    if (lines.length > 0) setConfirmDiscard(true);
    else onClose();
  };

  const submit = async () => {
    if (createPurchase.isPending) return;
    if (hasProblems) {
      setShowErrors(true);
      if (noLines) pickerRef.current?.focus();
      return;
    }
    setFormError(null);
    try {
      const purchase = await createPurchase.mutateAsync({
        supplierId: supplier.id,
        items: lines.map((line) => ({ product_id: line.product.id, quantity: line.quantity, unit_cost: line.unitCost ?? 0 })),
        paid_amount: paidNow > 0 ? paidNow : undefined,
        method: paidNow > 0 ? method : undefined,
        note: note.trim() || undefined,
        update_cost_price: updatePrices,
      });
      const paidText = paidNow > 0 ? ` · paid ${formatMoney(paidNow)}` : "";
      toast.success("Purchase recorded · stock updated", {
        description: `${pluralize(purchase.items.length, "item")} · ${formatMoney(purchase.total)} from ${supplier.name}${paidText}`,
      });
      onClose();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  useHotkey("mod+enter", () => void submit(), { enabled: open && !confirmDiscard, allowInInputs: true });

  let payHint: string | undefined;
  if (total > 0) {
    payHint =
      owedAfter > 0
        ? `You'll owe ${supplier.name} ${formatMoney(owedAfter)} after this (${formatMoney(supplier.outstanding)} now).`
        : `You won't owe ${supplier.name} anything after this.`;
  }

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        title="Record purchase"
        description={`From ${supplier.name}`}
        width={640}
        initialFocusRef={pickerRef}
        footer={
          <>
            <div className={styles.footerTotal}>
              <span className={styles.footerLabel}>{pluralize(lines.length, "item")}</span>
              <Money value={total} size="lg" />
            </div>
            <Button className={styles.cancel} onClick={requestClose} disabled={createPurchase.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={createPurchase.isPending}
              onClick={() => void submit()}
              title={`Record purchase (${modifierKeyLabel()}+Enter)`}
            >
              Record purchase
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <section className={styles.section} aria-labelledby={itemsHeadingId}>
            <h3 id={itemsHeadingId} className={styles.sectionTitle}>
              What came in
            </h3>
            <ProductPicker
              inputRef={pickerRef}
              price="purchase"
              inOrder={inPurchase}
              onSelect={addProduct}
              placeholder="Add a product by name or SKU"
              invalid={showErrors && noLines}
            />
            {showErrors && noLines && <p className={styles.error}>Add at least one item.</p>}
            {noLines ? (
              <p className={styles.emptyLines}>
                Add each product that came in. Its stock goes up by the quantity you enter, and you see the new figure
                before you save.
              </p>
            ) : (
              <ul className={styles.lines} aria-label="Items in this purchase">
                {lines.map((line) => (
                  <PurchaseLineRow
                    key={line.product.id}
                    line={line}
                    updatePrices={updatePrices}
                    problem={showErrors ? lineProblem(line) : undefined}
                    onQuantity={(quantity) => updateLine(line.product.id, { quantity })}
                    onCost={(unitCost) => updateLine(line.product.id, { unitCost })}
                    onRemove={() => removeLine(line.product.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section} aria-label="Payment">
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total</span>
              <Money value={total} size="lg" />
            </div>
            <Field label="Paid now" hint={payHint} error={showErrors ? paidProblem : undefined}>
              <div className={styles.payRow}>
                <MoneyInput
                  value={paid}
                  onChange={(value) => {
                    setPaid(value);
                    setFormError(null);
                  }}
                  wrapperClassName={styles.paidInput}
                />
                <Chip selected={total > 0 && paidNow === total} disabled={total <= 0} onClick={() => setPaid(total)}>
                  Full {formatMoney(total)}
                </Chip>
                <Chip selected={paidNow === 0} onClick={() => setPaid(null)}>
                  Pay later
                </Chip>
              </div>
            </Field>
            {paidNow > 0 && (
              <Field label="Paid by">
                <SegmentedControl block value={method} onChange={setMethod} options={METHOD_OPTIONS} />
              </Field>
            )}
            <Checkbox
              checked={updatePrices}
              onCheckedChange={setUpdatePrices}
              label="Update buy prices to these costs"
              description="So stock value and margins use what you paid this time."
            />
            <Field label="Note" optional>
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Bill no. 4521" maxLength={500} />
            </Field>
            <FormError message={formError} />
          </section>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard this purchase?"
        description="The items you added won't be saved and stock won't change."
        confirmLabel="Discard purchase"
        cancelLabel="Keep editing"
      />
    </>
  );
}

interface PurchaseLineRowProps {
  line: PurchaseLine;
  updatePrices: boolean;
  problem: string | undefined;
  onQuantity: (quantity: number) => void;
  onCost: (unitCost: number | null) => void;
  onRemove: () => void;
}

function PurchaseLineRow({ line, updatePrices, problem, onQuantity, onCost, onRemove }: PurchaseLineRowProps) {
  const { product, quantity, unitCost } = line;
  const per = perUnitLabel(product.unit);
  const total = lineTotal(quantity, unitCost ?? 0);
  const priceChanges = updatePrices && unitCost !== null && unitCost !== product.purchase_price;
  return (
    <li className={styles.line}>
      <div className={styles.lineHead}>
        <span className={styles.lineName}>{product.name}</span>
        <Money value={total} className={styles.lineTotal} />
        <IconButton
          label={`Remove ${product.name}`}
          icon={<X aria-hidden="true" />}
          size="sm"
          className={styles.remove}
          onClick={onRemove}
        />
      </div>
      <div className={styles.lineInputs}>
        <QuantityInput
          value={quantity}
          onChange={onQuantity}
          step={unitStep(product.unit)}
          unit={product.unit}
          size="sm"
          aria-label={`Quantity of ${product.name}`}
          invalid={problem !== undefined && !(quantity > 0)}
        />
        <span className={styles.times} aria-hidden="true">
          ×
        </span>
        <MoneyInput
          value={unitCost}
          onChange={onCost}
          size="sm"
          aria-label={`Cost per ${per} of ${product.name}`}
          invalid={problem !== undefined && unitCost === null}
          wrapperClassName={styles.cost}
        />
        <span className={styles.per}>per {per}</span>
      </div>
      <p className={styles.lineMeta}>
        <span className={styles.metaItem}>
          Stock{" "}
          <StockChange
            before={product.stock_quantity}
            after={roundQty(product.stock_quantity + quantity)}
            unit={product.unit}
            min={product.min_stock_level}
          />
        </span>
        {priceChanges && (
          <span className={styles.metaItem}>
            Buy price {formatMoney(product.purchase_price)} → {formatMoney(unitCost)}
          </span>
        )}
      </p>
      {problem && <p className={styles.error}>{problem}</p>}
    </li>
  );
}
