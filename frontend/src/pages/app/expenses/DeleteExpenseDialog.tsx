import { useState } from "react";
import { ConfirmDialog, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { EXPENSE_CATEGORY_LABEL } from "../../../lib/constants";
import { formatDate, formatMoney } from "../../../lib/format";
import { useDeleteExpense } from "../../../lib/queries";
import type { Expense } from "../../../lib/types";

export interface DeleteExpenseDialogProps {
  expense: Expense;
  open: boolean;
  onClose: () => void;
}

/** Confirms deleting an expense for good. */
export function DeleteExpenseDialog({ expense, open, onClose }: DeleteExpenseDialogProps) {
  const toast = useToast();
  const remove = useDeleteExpense();
  const [error, setError] = useState<string | null>(null);
  const summary = `${formatMoney(expense.amount)} · ${EXPENSE_CATEGORY_LABEL[expense.category]} · ${formatDate(expense.spent_at)}`;

  const confirm = async () => {
    if (remove.isPending) return;
    setError(null);
    try {
      await remove.mutateAsync(expense.id);
      toast.success("Expense deleted", { description: summary });
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={confirm}
      title="Delete this expense?"
      description={`${summary}. This can't be undone.`}
      confirmLabel="Delete expense"
      loading={remove.isPending}
      error={error}
    />
  );
}
