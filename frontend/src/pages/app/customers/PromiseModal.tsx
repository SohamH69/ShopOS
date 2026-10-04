import { CircleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button, Chip, Field, Input, Modal, MoneyInput, useToast } from "../../../components/ui";
import { errorMessage, isApiError } from "../../../lib/api";
import { addDaysISO, firstName, formatDate, formatMoney, todayISO } from "../../../lib/format";
import { toPaise } from "../../../lib/money";
import { useSetCustomerPromise } from "../../../lib/queries";
import type { Customer } from "../../../lib/types";
import styles from "./Dialogs.module.css";
import { useOpenSession } from "./useOpenSession";

const QUICK_DATES: readonly { label: string; days: number }[] = [
  { label: "Tomorrow", days: 1 },
  { label: "In 3 days", days: 3 },
  { label: "In a week", days: 7 },
];

type PromiseErrors = Partial<Record<"date" | "amount" | "form", string>>;

export interface PromiseModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer;
}

/** "I'll pay by Friday": records the date (and optionally the amount) a customer promised to pay. */
export function PromiseModal(props: PromiseModalProps) {
  const session = useOpenSession(props.open);
  return <PromiseDialog key={session} {...props} />;
}

function PromiseDialog({ open, onClose, customer }: PromiseModalProps) {
  const today = todayISO();
  const editing = customer.promise_date !== null;
  const due = customer.outstanding;
  const name = firstName(customer.name) || "This customer";
  const [date, setDate] = useState(customer.promise_date ?? "");
  const [amount, setAmount] = useState<number | null>(customer.promise_amount);
  const [note, setNote] = useState(customer.promise_note);
  const [errors, setErrors] = useState<PromiseErrors>({});
  const savePromise = useSetCustomerPromise();
  const toast = useToast();
  const pending = savePromise.isPending;

  const pickDate = (value: string) => {
    setDate(value);
    setErrors((previous) => ({ ...previous, date: undefined, form: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found: PromiseErrors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) found.date = "Pick the date they promised to pay by.";
    else if (date < today) found.date = "Pick today or a later date.";
    if (amount !== null && toPaise(amount) <= 0) found.amount = "Enter an amount more than ₹0, or leave it empty.";
    else if (amount !== null && toPaise(amount) > toPaise(due)) found.amount = `That's more than the ${formatMoney(due)} due.`;
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    try {
      await savePromise.mutateAsync({ customerId: customer.id, date, amount, note: note.trim() });
      toast.success("Promise saved", {
        description: `${name} will pay ${amount ? formatMoney(amount) : "the dues"} by ${formatDate(date)}.`,
      });
      onClose();
    } catch (caught) {
      const message = errorMessage(caught);
      if (isApiError(caught) && /date/i.test(message)) setErrors({ date: message });
      else if (isApiError(caught) && /amount/i.test(message)) setErrors({ amount: message });
      else setErrors({ form: message });
    }
  };

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={editing ? "Change payment promise" : "Add payment promise"}
      description={`${customer.name} owes ${formatMoney(due)}. When did they say they would pay?`}
      onSubmit={(event) => void handleSubmit(event)}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            Save promise
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="Pay by" error={errors.date}>
          <Input type="date" value={date} min={today} onChange={(event) => pickDate(event.target.value)} autoFocus />
        </Field>
        <div className={styles.chips} role="group" aria-label="Quick dates">
          {QUICK_DATES.map((option) => {
            const value = addDaysISO(today, option.days);
            return (
              <Chip key={option.label} selected={date === value} onClick={() => pickDate(value)}>
                {option.label}
              </Chip>
            );
          })}
        </div>
        <Field label="Amount" optional hint={`Leave empty for the full ${formatMoney(due)}.`} error={errors.amount}>
          <MoneyInput
            value={amount}
            onChange={(value) => {
              setAmount(value);
              setErrors((previous) => ({ ...previous, amount: undefined, form: undefined }));
            }}
          />
        </Field>
        <Field label="Note" optional>
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            autoComplete="off"
            placeholder="For example: after salary day on the 1st"
          />
        </Field>
        {errors.form && (
          <p className={styles.formError} role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{errors.form}</span>
          </p>
        )}
      </div>
    </Modal>
  );
}
