import { useRef, useState, type FormEvent } from "react";
import { Button, Field, Input, Modal, MoneyInput, Select, useToast } from "../../../components/ui";
import { errorMessage, isApiError } from "../../../lib/api";
import { EXPENSE_CATEGORY_LABEL, toOptions } from "../../../lib/constants";
import { formatMoney, istDateTime, todayISO, toISODate } from "../../../lib/format";
import { useCreateExpense, useUpdateExpense } from "../../../lib/queries";
import type { Expense, ExpenseCategory } from "../../../lib/types";
import { FormError } from "../products/FormError";
import styles from "./ExpenseFormModal.module.css";

type FieldName = "category" | "amount" | "date" | "note";
type FieldErrors = Partial<Record<FieldName, string>>;

const CATEGORY_OPTIONS = toOptions(EXPENSE_CATEGORY_LABEL);

const NOTE_PLACEHOLDER: Readonly<Record<ExpenseCategory, string>> = {
  rent: "e.g. October rent",
  electricity: "e.g. Electricity bill for September",
  salaries: "e.g. Arjun, October salary",
  transportation: "e.g. Tempo for stock from the market",
  repairs: "e.g. Fridge repair",
  supplier: "e.g. Advance to Agarwal Traders",
  miscellaneous: "e.g. Cleaning supplies",
};

// 422 field paths from the API, mapped to the fields on this form.
const SERVER_FIELDS: Readonly<Record<string, FieldName>> = {
  category: "category",
  amount: "amount",
  spent_at: "date",
  note: "note",
};

export interface ExpenseFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The expense to edit; without it the form adds a new one. */
  expense?: Expense;
  /** Category picked in advance for a new expense (e.g. the list's category filter). */
  defaultCategory?: ExpenseCategory;
}

/** Add or edit a running cost: category, amount, the day it was spent and a note. */
export function ExpenseFormModal({ open, onClose, expense, defaultCategory }: ExpenseFormModalProps) {
  const toast = useToast();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const categoryRef = useRef<HTMLSelectElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const today = todayISO();
  const initialDate = expense ? toISODate(expense.spent_at) : today;
  const [category, setCategory] = useState<ExpenseCategory | "">(expense?.category ?? defaultCategory ?? "");
  const [amount, setAmount] = useState<number | null>(expense ? expense.amount : null);
  const [date, setDate] = useState(initialDate);
  const [note, setNote] = useState(expense?.note ?? "");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const saving = createExpense.isPending || updateExpense.isPending;

  const clearError = (field: FieldName) => {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!category) next.category = "Choose a category.";
    if (!(amount !== null && amount > 0)) next.amount = "Enter an amount more than ₹0.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Pick the day it was spent.";
    else if (date > today) next.date = "Pick today or an earlier day.";
    return next;
  };

  /** Unchanged day: keep the stored time. Today: now. Another day: midday IST, so it never slips a day. */
  const spentAt = (): string | undefined => {
    if (date === initialDate) return undefined;
    if (date === today) return new Date().toISOString();
    return istDateTime(date, 12, 0);
  };

  const showServerError = (error: unknown) => {
    if (isApiError(error) && error.fieldErrors) {
      const mapped: FieldErrors = {};
      for (const [path, message] of Object.entries(error.fieldErrors)) {
        const field = SERVER_FIELDS[path.split(".")[0]];
        if (field && !mapped[field]) mapped[field] = message;
      }
      if (Object.keys(mapped).length > 0) {
        setErrors(mapped);
        return;
      }
    }
    setFormError(errorMessage(error));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const problems = validate();
    setErrors(problems);
    if (problems.category || !category) {
      categoryRef.current?.focus();
      return;
    }
    if (problems.amount || amount === null) {
      amountRef.current?.focus();
      return;
    }
    if (problems.date) {
      dateRef.current?.focus();
      return;
    }
    setFormError(null);
    const label = EXPENSE_CATEGORY_LABEL[category];
    try {
      if (expense) {
        await updateExpense.mutateAsync({ id: expense.id, category, amount, note: note.trim(), spent_at: spentAt() });
        toast.success("Changes saved", { description: `${formatMoney(amount)} · ${label}` });
      } else {
        await createExpense.mutateAsync({ category, amount, note: note.trim() || undefined, spent_at: spentAt() });
        toast.success("Expense added", { description: `${formatMoney(amount)} · ${label}` });
      }
      onClose();
    } catch (error) {
      showServerError(error);
    }
  };

  const initialFocus = expense || category ? amountRef : categoryRef;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? "Edit expense" : "Add expense"}
      description={expense ? undefined : "Rent, bills, salaries or anything else the shop paid for."}
      initialFocusRef={initialFocus}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {expense ? "Save changes" : "Add expense"}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <Field label="Category" error={errors.category} className={styles.full}>
          <Select
            ref={categoryRef}
            value={category}
            onValueChange={(value) => {
              setCategory(value);
              clearError("category");
            }}
            placeholder={category ? undefined : "Choose a category"}
            options={CATEGORY_OPTIONS}
          />
        </Field>
        <Field label="Amount" error={errors.amount}>
          <MoneyInput
            ref={amountRef}
            value={amount}
            onChange={(value) => {
              setAmount(value);
              clearError("amount");
            }}
          />
        </Field>
        <Field label="Date" error={errors.date}>
          <Input
            ref={dateRef}
            type="date"
            value={date}
            max={today}
            onChange={(event) => {
              setDate(event.target.value);
              clearError("date");
            }}
          />
        </Field>
        <Field label="Note" optional error={errors.note} className={styles.full}>
          <Input
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              clearError("note");
            }}
            placeholder={category ? NOTE_PLACEHOLDER[category] : "What was it for?"}
            maxLength={500}
          />
        </Field>
        <FormError message={formError} className={styles.full} />
      </div>
    </Modal>
  );
}
