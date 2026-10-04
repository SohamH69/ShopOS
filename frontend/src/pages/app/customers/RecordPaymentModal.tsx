import { CircleAlert } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Button, Chip, Field, Input, Modal, MoneyInput, SegmentedControl, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { METHOD_SHORT_LABEL, toOptions } from "../../../lib/constants";
import { firstName, formatCount, formatMoney, orderNo } from "../../../lib/format";
import { fromPaise, toPaise } from "../../../lib/money";
import { useRecordCustomerPayment } from "../../../lib/queries";
import type { Customer, CustomerPaymentResult, Order, PaymentAllocation, PaymentMethod } from "../../../lib/types";
import styles from "./Dialogs.module.css";
import { useOpenSession } from "./useOpenSession";

const METHOD_OPTIONS = toOptions(METHOD_SHORT_LABEL);

/** "#1045", "#1045 and #1050", "#1045, #1048 and #1050", "#1045, #1048 and 3 more orders". */
function orderListText(numbers: readonly number[]): string {
  const labels = numbers.map((number) => orderNo(number));
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length <= 3) return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${labels.slice(0, 2).join(", ")} and ${formatCount(labels.length - 2)} more orders`;
}

function allocationText(allocations: readonly PaymentAllocation[]): string {
  return orderListText(allocations.map((allocation) => allocation.order_number));
}

/**
 * What a payment of `amount` will clear, oldest unpaid order first — the same FIFO rule the server
 * applies: "Pays off #1124 and ₹120 of #1133."
 */
function previewText(amount: number, unpaidOldestFirst: readonly Order[]): string | null {
  let remaining = toPaise(amount);
  if (remaining <= 0) return null;
  const cleared: number[] = [];
  let partial: { number: number; paise: number } | null = null;
  for (const order of unpaidOldestFirst) {
    if (remaining <= 0) break;
    const due = toPaise(order.outstanding);
    if (remaining >= due) {
      cleared.push(order.number);
      remaining -= due;
    } else {
      partial = { number: order.number, paise: remaining };
      remaining = 0;
    }
  }
  const partialText = partial ? `${formatMoney(fromPaise(partial.paise))} of ${orderNo(partial.number)}` : "";
  if (cleared.length > 0 && partialText) return `Pays off ${orderListText(cleared)}, and ${partialText}.`;
  if (cleared.length > 0) return `Pays off ${orderListText(cleared)}.`;
  if (partialText) return `Pays ${partialText}.`;
  return null;
}

export interface RecordPaymentModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  /** The customer's orders (any order), used to preview which orders the payment clears. */
  orders?: readonly Order[];
  onRecorded?: (result: CustomerPaymentResult) => void;
}

/** Khata payment: collected against the customer's dues, oldest orders first. */
export function RecordPaymentModal(props: RecordPaymentModalProps) {
  const session = useOpenSession(props.open);
  return <RecordPaymentDialog key={session} {...props} />;
}

function RecordPaymentDialog({ open, onClose, customer, orders, onRecorded }: RecordPaymentModalProps) {
  const due = customer.outstanding;
  const [amount, setAmount] = useState<number | null>(due > 0 ? due : null);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const record = useRecordCustomerPayment();
  const toast = useToast();
  const pending = record.isPending;

  const unpaidOldestFirst = useMemo(
    () =>
      (orders ?? [])
        .filter((order) => order.status !== "cancelled" && order.outstanding > 0)
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id),
    [orders],
  );

  const amountPaise = amount === null ? 0 : toPaise(amount);
  const validAmount = amount !== null && amountPaise > 0 && amountPaise <= toPaise(due);
  const preview = validAmount && orders ? previewText(amount, unpaidOldestFirst) : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (amount === null || amountPaise <= 0) {
      setAmountError("Enter an amount more than ₹0.");
      return;
    }
    if (amountPaise > toPaise(due)) {
      setAmountError(`That's more than the ${formatMoney(due)} ${firstName(customer.name) || "this customer"} owes.`);
      return;
    }
    setFormError(null);
    try {
      const result = await record.mutateAsync({ customerId: customer.id, amount, method, note: note.trim() || undefined });
      toast.success(`${formatMoney(result.total)} recorded against ${allocationText(result.allocations)}`, {
        description: result.outstanding > 0 ? `${formatMoney(result.outstanding)} is still due.` : "Khata settled. Nothing is due now.",
      });
      onRecorded?.(result);
      onClose();
    } catch (caught) {
      setFormError(errorMessage(caught));
    }
  };

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title="Record payment"
      description={`${customer.name} owes ${formatMoney(due)}. A payment clears the oldest unpaid orders first.`}
      onSubmit={(event) => void handleSubmit(event)}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {validAmount ? `Record ${formatMoney(amount)}` : "Record payment"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="Amount" hint={preview ?? `Up to ${formatMoney(due)}`} error={amountError}>
          <MoneyInput
            value={amount}
            onChange={(value) => {
              setAmount(value);
              setAmountError(null);
            }}
            onFocus={(event) => event.currentTarget.select()}
            size="lg"
            autoFocus
          />
        </Field>
        <div className={styles.chips}>
          <Chip selected={amount !== null && amountPaise === toPaise(due)} onClick={() => setAmount(due)}>
            Full {formatMoney(due)}
          </Chip>
        </div>
        <Field label="Method">
          <SegmentedControl<PaymentMethod> options={METHOD_OPTIONS} value={method} onChange={setMethod} block />
        </Field>
        <Field label="Note" optional>
          <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} autoComplete="off" />
        </Field>
        {formError && (
          <p className={styles.formError} role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}
