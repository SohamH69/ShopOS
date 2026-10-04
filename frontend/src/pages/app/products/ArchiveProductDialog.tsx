import { useState } from "react";
import { ConfirmDialog, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { formatQty } from "../../../lib/format";
import { useArchiveProduct } from "../../../lib/queries";
import type { Product } from "../../../lib/types";

export interface ArchiveProductDialogProps {
  product: Product;
  open: boolean;
  onClose: () => void;
  /** Called after the product is archived (e.g. to close its drawer). */
  onArchived?: (product: Product) => void;
}

/** Confirms archiving: the product leaves new orders and purchases, its history stays. */
export function ArchiveProductDialog({ product, open, onClose, onArchived }: ArchiveProductDialogProps) {
  const toast = useToast();
  const archive = useArchiveProduct();
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (archive.isPending) return;
    setError(null);
    try {
      await archive.mutateAsync(product.id);
      toast.success("Product archived", { description: product.name });
      onArchived?.(product);
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
      title={`Archive ${product.name}?`}
      description="It won't show up in new orders or purchases. Past orders and its stock history stay as they are."
      confirmLabel="Archive product"
      loading={archive.isPending}
      error={error}
    >
      {product.reserved_quantity > 0 ? (
        <p className="muted">
          {formatQty(product.reserved_quantity, product.unit)} is in open orders. Those orders keep it and can still be
          completed.
        </p>
      ) : null}
    </ConfirmDialog>
  );
}
