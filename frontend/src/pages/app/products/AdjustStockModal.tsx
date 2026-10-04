import { ArrowRight } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  QuantityInput,
  SegmentedControl,
  Select,
  stockLevel,
  useToast,
  type SegmentedOption,
} from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { STOCK_REASON_LABEL, toOptions, unitStep } from "../../../lib/constants";
import { cx } from "../../../lib/cx";
import { formatQty } from "../../../lib/format";
import { roundQty } from "../../../lib/money";
import { useAdjustStock } from "../../../lib/queries";
import type { Product, StockReason } from "../../../lib/types";
import styles from "./AdjustStockModal.module.css";
import { FormError } from "./FormError";
import { selectLoneZero } from "./selectLoneZero";
import { signedQty, stockAfterAdjustment, type AdjustMode } from "./stock";

const MODE_OPTIONS: readonly SegmentedOption<AdjustMode>[] = [
  { value: "add", label: "Add stock" },
  { value: "remove", label: "Remove" },
  { value: "set", label: "Set count" },
];

const REASON_OPTIONS = toOptions(STOCK_REASON_LABEL);

const DEFAULT_REASON: Readonly<Record<AdjustMode, StockReason>> = {
  add: "restock",
  remove: "damage",
  set: "correction",
};

const QUANTITY_LABEL: Readonly<Record<AdjustMode, string>> = {
  add: "How much came in",
  remove: "How much to remove",
  set: "Stock you counted",
};

const DONE: Readonly<Record<AdjustMode, string>> = {
  add: "Stock added",
  remove: "Stock removed",
  set: "Stock count saved",
};

const NOTE_PLACEHOLDER: Readonly<Record<StockReason, string>> = {
  restock: "e.g. Delivered by the wholesaler",
  damage: "e.g. Two packets torn",
  correction: "e.g. Counted on Sunday",
  return: "e.g. Returned by Rahul Sharma",
  other: "What happened",
};

function quantityProblem(mode: AdjustMode, quantity: number, change: number, current: number, unit: string): string | undefined {
  if (mode === "set") return change === 0 ? `Stock is already ${formatQty(current, unit)}.` : undefined;
  if (quantity > 0) return undefined;
  return mode === "add" ? "Enter how much stock came in." : "Enter how much to remove.";
}

function submitLabel(mode: AdjustMode, quantity: number, unit: string): string {
  if (mode === "set") return `Set stock to ${formatQty(quantity, unit)}`;
  if (!(quantity > 0)) return mode === "add" ? "Add stock" : "Remove stock";
  return `${mode === "add" ? "Add" : "Remove"} ${formatQty(quantity, unit)}`;
}

export interface AdjustStockModalProps {
  product: Product;
  open: boolean;
  onClose: () => void;
}

/** Add, remove or set a product's stock with a reason, previewing the stock before and after. */
export function AdjustStockModal({ product, open, onClose }: AdjustStockModalProps) {
  const toast = useToast();
  const adjust = useAdjustStock();
  const quantityRef = useRef<HTMLInputElement>(null);
  const { unit, stock_quantity: current, min_stock_level: min } = product;

  const [mode, setMode] = useState<AdjustMode>("add");
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState<StockReason>(DEFAULT_REASON.add);
  const [reasonChosen, setReasonChosen] = useState(false);
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const after = stockAfterAdjustment(current, mode, quantity);
  const change = roundQty(after - current);
  const problem = quantityProblem(mode, quantity, change, current, unit);

  const changeMode = (next: AdjustMode) => {
    if (next === mode) return;
    // A count starts from today's figure; add and remove start from zero.
    if (next === "set") setQuantity(Math.max(0, roundQty(current)));
    else if (mode === "set") setQuantity(0);
    if (!reasonChosen) setReason(DEFAULT_REASON[next]);
    setMode(next);
    setShowErrors(false);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (adjust.isPending) return;
    if (problem) {
      setShowErrors(true);
      quantityRef.current?.focus();
      return;
    }
    setFormError(null);
    try {
      const updated = await adjust.mutateAsync({
        productId: product.id,
        mode,
        quantity,
        reason,
        note: note.trim() || undefined,
      });
      toast.success(DONE[mode], {
        description: `${updated.name}: ${formatQty(current, unit)} → ${formatQty(updated.stock_quantity, updated.unit)}`,
      });
      onClose();
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust stock"
      description={product.name}
      initialFocusRef={quantityRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={adjust.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={adjust.isPending}>
            {submitLabel(mode, quantity, unit)}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <SegmentedControl label="Type of change" block value={mode} onChange={changeMode} options={MODE_OPTIONS} />
        <div className={styles.row}>
          <Field label={QUANTITY_LABEL[mode]} error={showErrors ? problem : undefined}>
            <div onFocus={selectLoneZero}>
              <QuantityInput
                inputRef={quantityRef}
                value={quantity}
                onChange={(value) => {
                  setQuantity(value);
                  setFormError(null);
                }}
                step={unitStep(unit)}
                unit={unit}
              />
            </div>
          </Field>
          <Field label="Reason">
            <Select
              value={reason}
              options={REASON_OPTIONS}
              onValueChange={(value) => {
                setReason(value);
                setReasonChosen(true);
              }}
            />
          </Field>
        </div>
        <StockPreview current={current} after={after} change={change} unit={unit} min={min} />
        <Field label="Note" optional>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder={NOTE_PLACEHOLDER[reason]} maxLength={500} />
        </Field>
        <FormError message={formError} />
      </div>
    </Modal>
  );
}

interface StockPreviewProps {
  current: number;
  after: number;
  change: number;
  unit: string;
  min: number;
}

/** Stock now → stock after this change, with what the new level means. */
function StockPreview({ current, after, change, unit, min }: StockPreviewProps) {
  const level = stockLevel(after, min);
  let message: string;
  let tone: "muted" | "ok" | "low" | "out";
  if (change === 0) {
    message = "No change yet.";
    tone = "muted";
  } else if (after < 0) {
    message = "This takes stock below zero.";
    tone = "out";
  } else if (level === "out") {
    message = "Out of stock after this.";
    tone = "out";
  } else if (level === "low") {
    message = `At or below the low-stock level of ${formatQty(min, unit)}.`;
    tone = "low";
  } else {
    message = min > 0 ? `Above the low-stock level of ${formatQty(min, unit)}.` : "In stock.";
    tone = "ok";
  }

  return (
    <div className={styles.preview}>
      <div className={styles.side}>
        <span className={styles.sideLabel}>Now</span>
        <span className={cx(styles.value, styles.valueNow)}>{formatQty(current, unit)}</span>
      </div>
      <ArrowRight className={styles.arrow} aria-hidden="true" />
      <div className={styles.side}>
        <span className={styles.sideLabel}>After</span>
        <span className={cx(styles.value, styles[`level_${level}`])}>{formatQty(after, unit)}</span>
      </div>
      <p className={styles.note}>
        {change !== 0 && <span className={cx(styles.change, change > 0 ? styles.up : styles.down)}>{signedQty(change, unit)}</span>}
        <span className={styles[`tone_${tone}`]}>{message}</span>
      </p>
      <p className="visually-hidden" aria-live="polite">
        {change === 0 ? "" : `After this change: ${formatQty(after, unit)}. ${message}`}
      </p>
    </div>
  );
}
