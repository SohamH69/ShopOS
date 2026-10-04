import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type Dispatch, type KeyboardEvent, type Ref, type SetStateAction } from "react";
import { Field, IconButton, Input, Money, MoneyInput, QuantityInput } from "../../components/ui";
import { assignRef } from "../../components/ui/utils";
import { unitStep } from "../../lib/constants";
import { formatQty } from "../../lib/format";
import { roundQty } from "../../lib/money";
import { useProducts } from "../../lib/queries";
import type { Product } from "../../lib/types";
import { ProductPicker } from "../pickers/ProductPicker";
import styles from "./LineItemsEditor.module.css";
import {
  addProductLine,
  customLine,
  defaultQuantity,
  draftLineTotal,
  lineFromProduct,
  minQuantity,
  type DraftLine,
  type LineField,
  type LineIssue,
} from "./orderDraft";

export interface LineItemsEditorProps {
  lines: readonly DraftLine[];
  setLines: Dispatch<SetStateAction<DraftLine[]>>;
  /** Problems to show on lines (usually after a save attempt), keyed by line key. */
  issues?: Readonly<Record<string, LineIssue>>;
  /** The product search field, e.g. to focus it from the parent. */
  pickerRef?: Ref<HTMLInputElement>;
  pickerAutoFocus?: boolean;
  /** Error under the product search, e.g. "Add at least one item." */
  pickerError?: string | null;
  onPickerKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  /** Accessible name of the list of lines. */
  label?: string;
}

// Spoken unit names for the price fields ("Price of Sugar, per kg").
const UNIT_WORD: Record<string, string> = {
  pcs: "piece",
  kg: "kg",
  g: "gram",
  l: "litre",
  ml: "ml",
  pack: "pack",
  dozen: "dozen",
  box: "box",
};

interface Flash {
  key: string;
  tick: number;
}

/**
 * Order lines with a product search underneath: pick with ↑ ↓ Enter (picking a product again adds one
 * more), adjust quantity and price inline, reveal a line discount, add custom items. Never blocks on stock.
 */
export function LineItemsEditor({
  lines,
  setLines,
  issues = {},
  pickerRef,
  pickerAutoFocus,
  pickerError,
  onPickerKeyDown,
  label = "Items",
}: LineItemsEditorProps) {
  const products = useProducts();
  const productsById = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product] as const)),
    [products.data],
  );
  const inOrder = useMemo(() => {
    const quantities: Record<number, number> = {};
    for (const line of lines) {
      if (line.productId !== null) quantities[line.productId] = roundQty((quantities[line.productId] ?? 0) + line.quantity);
    }
    return quantities;
  }, [lines]);

  const pickerInput = useRef<HTMLInputElement | null>(null);
  const fields = useRef(new Map<string, HTMLInputElement>());
  const focusAfterRender = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [flash, setFlash] = useState<Flash | null>(null);

  // Focus a field of a line that has only just been rendered (a new custom item, a revealed discount).
  useEffect(() => {
    const target = focusAfterRender.current;
    if (!target) return;
    focusAfterRender.current = null;
    fields.current.get(target)?.focus();
  });

  const fieldRef = (key: string, field: LineField) => (node: HTMLInputElement | null) => {
    const id = `${key}:${field}`;
    if (node) fields.current.set(id, node);
    else fields.current.delete(id);
  };

  const highlight = (key: string) => setFlash((previous) => ({ key, tick: (previous?.tick ?? 0) + 1 }));

  const handleSelect = (product: Product) => {
    const existing = lines.find((line) => line.productId === product.id);
    if (existing) {
      setLines((current) => addProductLine(current, product));
      highlight(existing.key);
      const quantity = roundQty(existing.quantity + defaultQuantity(existing.unit));
      setAnnouncement(`${product.name}, now ${formatQty(quantity, existing.unit)}`);
      return;
    }
    const line = lineFromProduct(product);
    setLines((current) => (current.some((entry) => entry.productId === product.id) ? addProductLine(current, product) : [...current, line]));
    highlight(line.key);
    setAnnouncement(`Added ${product.name}`);
  };

  const addCustom = (name: string) => {
    const line = customLine(name);
    setLines((current) => [...current, line]);
    focusAfterRender.current = `${line.key}:${name ? "price" : "name"}`;
    setAnnouncement(name ? `Added custom item ${name}. Enter its price.` : "Added a custom item. Enter its name and price.");
  };

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const remove = (line: DraftLine) => {
    setLines((current) => current.filter((entry) => entry.key !== line.key));
    setAnnouncement(`Removed ${line.name.trim() || "custom item"}`);
    pickerInput.current?.focus();
  };

  return (
    <div className={styles.editor}>
      {lines.length > 0 && (
        <>
          <div className={styles.head} aria-hidden="true">
            <span>Item</span>
            <span>Qty</span>
            <span>Price</span>
            <span className={styles.right}>Total</span>
            <span />
          </div>
          <ul className={styles.lines} aria-label={label}>
            {lines.map((line) => (
              <LineRow
                key={line.key}
                line={line}
                product={line.productId === null ? undefined : productsById.get(line.productId)}
                issue={issues[line.key]}
                flash={flash?.key === line.key ? (flash.tick % 2 === 0 ? "a" : "b") : undefined}
                fieldRef={(field) => fieldRef(line.key, field)}
                onUpdate={(patch) => update(line.key, patch)}
                onOpenDiscount={() => {
                  update(line.key, { discountOpen: true });
                  focusAfterRender.current = `${line.key}:discount`;
                }}
                onRemove={() => remove(line)}
              />
            ))}
          </ul>
        </>
      )}

      <div className={styles.add}>
        <Field label="Add a product" labelHidden error={pickerError}>
          <ProductPicker
            inputRef={(node) => {
              pickerInput.current = node;
              assignRef(pickerRef, node);
            }}
            onSelect={handleSelect}
            onCustomItem={addCustom}
            inOrder={inOrder}
            autoFocus={pickerAutoFocus}
            onKeyDown={onPickerKeyDown}
          />
        </Field>
        <button type="button" className={styles.customButton} onClick={() => addCustom("")}>
          <Plus aria-hidden="true" />
          Add custom item
        </button>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

interface LineRowProps {
  line: DraftLine;
  product: Product | undefined;
  issue: LineIssue | undefined;
  flash: "a" | "b" | undefined;
  fieldRef: (field: LineField) => (node: HTMLInputElement | null) => void;
  onUpdate: (patch: Partial<DraftLine>) => void;
  onOpenDiscount: () => void;
  onRemove: () => void;
}

function LineRow({ line, product, issue, flash, fieldRef, onUpdate, onOpenDiscount, onRemove }: LineRowProps) {
  const custom = line.productId === null;
  const name = line.name.trim() || "custom item";
  const issueId = `${line.key}-issue`;
  const discountId = `${line.key}-discount`;
  const describedBy = (field: LineField) => (issue?.field === field ? issueId : undefined);

  return (
    <li className={styles.line} data-flash={flash}>
      <div className={styles.nameCell}>
        {custom ? (
          <Input
            ref={fieldRef("name")}
            size="sm"
            value={line.name}
            placeholder="Item name"
            aria-label="Custom item name"
            maxLength={160}
            autoComplete="off"
            invalid={issue?.field === "name"}
            aria-describedby={describedBy("name")}
            onChange={(event) => onUpdate({ name: event.target.value })}
          />
        ) : (
          <span className={styles.name}>{line.name}</span>
        )}
        <span className={styles.meta}>
          {custom ? <span>Custom item</span> : <StockNote product={product} quantity={line.quantity} />}
          {!line.discountOpen && (
            <button type="button" className={styles.metaButton} onClick={onOpenDiscount}>
              Discount
            </button>
          )}
        </span>
      </div>

      <div className={styles.qtyCell}>
        <QuantityInput
          inputRef={fieldRef("quantity")}
          size="sm"
          value={line.quantity}
          onChange={(quantity) => onUpdate({ quantity })}
          step={unitStep(line.unit)}
          min={minQuantity(line.unit)}
          unit={line.unit}
          invalid={issue?.field === "quantity"}
          aria-describedby={describedBy("quantity")}
          aria-label={`Quantity of ${name}`}
        />
      </div>

      <div className={styles.priceCell}>
        <MoneyInput
          ref={fieldRef("price")}
          size="sm"
          value={line.unitPrice}
          onChange={(unitPrice) => onUpdate({ unitPrice })}
          invalid={issue?.field === "price"}
          aria-describedby={describedBy("price")}
          aria-label={`Price of ${name}, per ${UNIT_WORD[line.unit] ?? line.unit}`}
        />
      </div>

      <div className={styles.totalCell}>
        <Money value={draftLineTotal(line)} />
      </div>

      <div className={styles.removeCell}>
        <IconButton size="sm" label={`Remove ${name}`} icon={<X aria-hidden="true" />} onClick={onRemove} />
      </div>

      {(line.discountOpen || issue) && (
        <div className={styles.extra}>
          {line.discountOpen && (
            <div className={styles.discount}>
              <label className={styles.discountLabel} htmlFor={discountId}>
                Discount
              </label>
              <MoneyInput
                id={discountId}
                ref={fieldRef("discount")}
                size="sm"
                wrapperClassName={styles.discountInput}
                value={line.discount}
                onChange={(discount) => onUpdate({ discount })}
                invalid={issue?.field === "discount"}
                aria-describedby={describedBy("discount")}
              />
              <button
                type="button"
                className={styles.metaButton}
                onClick={() => onUpdate({ discount: null, discountOpen: false })}
              >
                Remove discount
              </button>
            </div>
          )}
          {issue && (
            <p id={issueId} className={styles.issue}>
              {issue.message}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** "12 kg in stock" · "Only 3 in stock" (haldi) · "Out of stock" (margin). Informational only. */
function StockNote({ product, quantity }: { product: Product | undefined; quantity: number }) {
  if (!product) return null;
  const stock = product.stock_quantity;
  if (stock <= 0) return <span className={styles.stockOut}>Out of stock</span>;
  if (quantity > stock || product.low_stock) {
    return <span className={styles.stockLow}>Only {formatQty(stock, product.unit)} in stock</span>;
  }
  return <span>{formatQty(stock, product.unit)} in stock</span>;
}
