import { ArrowRight } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button, Chip, Field, Input, Modal, Money, MoneyInput, SegmentedControl, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { METHOD_SHORT_LABEL, toOptions } from "../../../lib/constants";
import { formatMoney } from "../../../lib/format";
import { roundMoney } from "../../../lib/money";
import { useRecordSupplierPayment } from "../../../lib/queries";
import type { PaymentMethod, Supplier } from "../../../lib/types";
import { FormError } from "../products/FormError";
import styles from "./PaySupplierModal.module.css";

const METHOD_OPTIONS = toOptions(METHOD_SHORT_LABEL);

export interface PaySupplierModalProps {
  supplier: Supplier;
  open: boolean;
  onClose: () => void;
}

/** Records money paid to a supplier (up to what you owe), previewing what is still owed after. */
export function PaySupplierModal({ supplier, open, onClose }: PaySupplierModalProps) {
  const toast = useToast();
  const pay = useRecordSupplierPayment();
  const amountRef = useRef<HTMLInputElement>(null);
  const due = supplier.outstanding;

  const [amount, setAmount] = useState<number | null>(due > 0 ? due : null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const value = amount ?? 0;
  let problem: string | undefined;
  if (due <= 0) problem = "You don't owe this supplier anything right now.";
  else if (!(value > 0)) problem = "Enter an amount more than ₹0.";
  else if (value > due) problem = `Amount is more than the ${formatMoney(due)} you owe.`;
  const remaining = roundMoney(due - value);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pay.isPending) return;
    if (problem) {
      setShowErrors(true);
      amountRef.current?.focus();
      return;
    }
    setFormError(null);
    try {
      await pay.mutateAsync({ supplierId: supplier.id, amount: value, method, note: note.trim() || undefined });
      toast.success("Payment recorded", {
        description:
          remaining > 0
            ? `${formatMoney(value)} paid to ${supplier.name} · ${formatMoney(remaining)} still owed`
            : `${formatMoney(value)} paid to ${supplier.name} · nothing owed now`,
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
      title="Pay supplier"
      description={`You owe ${supplier.name} ${formatMoney(due)}.`}
      initialFocusRef={amountRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={pay.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pay.isPending}>
            {problem ? "Pay supplier" : `Pay ${formatMoney(value)}`}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="Amount" error={showErrors ? problem : undefined}>
          <div className={styles.amountRow}>
            <MoneyInput
              ref={amountRef}
              value={amount}
              onChange={(next) => {
                setAmount(next);
                setFormError(null);
              }}
              wrapperClassName={styles.amount}
            />
            {due > 0 && (
              <Chip selected={value === due} onClick={() => setAmount(due)}>
                Full {formatMoney(due)}
              </Chip>
            )}
          </div>
        </Field>
        <Field label="Paid by">
          <SegmentedControl block value={method} onChange={setMethod} options={METHOD_OPTIONS} />
        </Field>
        {!problem && (
          <div className={styles.preview}>
            <span className={styles.previewLabel}>You owe</span>
            <span className={styles.previewChange}>
              <Money value={due} tone="muted" />
              <ArrowRight className={styles.arrow} aria-hidden="true" />
              {remaining > 0 ? (
                <Money value={remaining} tone="margin" />
              ) : (
                <span className={styles.settled}>Nothing</span>
              )}
            </span>
          </div>
        )}
        <Field label="Note" optional>
          <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. Against bill 4521" maxLength={500} />
        </Field>
        <FormError message={formError} />
      </div>
    </Modal>
  );
}
