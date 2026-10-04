import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Modal, MoneyInput, QuantityInput, Select, useToast } from "../../../components/ui";
import { errorMessage, isApiError } from "../../../lib/api";
import { toOptions, UNIT_NAME, unitStep } from "../../../lib/constants";
import { formatMoney, formatPercent, formatQty } from "../../../lib/format";
import { useCreateProduct, useProductCategories, useUpdateProduct } from "../../../lib/queries";
import type { Product, ProductUnit } from "../../../lib/types";
import { FormError } from "./FormError";
import styles from "./ProductFormModal.module.css";
import { selectLoneZero } from "./selectLoneZero";
import { marginPercent, marginPerUnit, perUnitLabel } from "./stock";

type FieldName = "name" | "category" | "sku" | "buy" | "sell" | "opening" | "min";
type FieldErrors = Partial<Record<FieldName, string>>;

const UNIT_OPTIONS = toOptions(UNIT_NAME);

// 422 field paths from the API, mapped to the fields on this form.
const SERVER_FIELDS: Readonly<Record<string, FieldName>> = {
  name: "name",
  category: "category",
  sku: "sku",
  purchase_price: "buy",
  selling_price: "sell",
  stock_quantity: "opening",
  min_stock_level: "min",
};

export interface ProductFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The product to edit; without it the form adds a new product. */
  product?: Product;
  /** Opens a product; offered on the toast after adding one. */
  onOpenProduct?: (productId: number) => void;
}

/** Add a product, or edit its name, category, unit, prices and low-stock level. */
export function ProductFormModal({ open, onClose, product, onOpenProduct }: ProductFormModalProps) {
  const toast = useToast();
  const categories = useProductCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const categoryListId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const sellRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [unit, setUnit] = useState<ProductUnit>(product?.unit ?? "pcs");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [openingStock, setOpeningStock] = useState(0);
  const [minLevel, setMinLevel] = useState(product?.min_stock_level ?? 0);
  const [buyPrice, setBuyPrice] = useState<number | null>(product ? product.purchase_price : null);
  const [sellPrice, setSellPrice] = useState<number | null>(product ? product.selling_price : null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const saving = createProduct.isPending || updateProduct.isPending;
  const per = perUnitLabel(unit);
  const step = unitStep(unit);

  const clearError = (field: FieldName) => {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Enter the product name.";
    if (sellPrice === null) next.sell = "Enter the selling price.";
    return next;
  };

  const showServerError = (error: unknown) => {
    if (isApiError(error) && error.status === 409) {
      setErrors({ name: error.message });
      nameRef.current?.focus();
      return;
    }
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
    if (problems.name) {
      nameRef.current?.focus();
      return;
    }
    if (problems.sell || sellPrice === null) {
      sellRef.current?.focus();
      return;
    }
    setFormError(null);
    const fields = {
      name: name.trim(),
      category: category.trim(),
      unit,
      sku: sku.trim() || null,
      min_stock_level: minLevel,
      purchase_price: buyPrice ?? 0,
      selling_price: sellPrice,
    };
    try {
      if (product) {
        const saved = await updateProduct.mutateAsync({ id: product.id, ...fields });
        toast.success("Changes saved", { description: saved.name });
      } else {
        const created = await createProduct.mutateAsync({ ...fields, stock_quantity: openingStock });
        toast.success("Product added", {
          description:
            created.stock_quantity > 0
              ? `${created.name} · ${formatQty(created.stock_quantity, created.unit)} in stock`
              : created.name,
          action: onOpenProduct ? { label: "Open", onClick: () => onOpenProduct(created.id) } : undefined,
        });
      }
      onClose();
    } catch (error) {
      showServerError(error);
    }
  };

  const margin = marginPercent(buyPrice, sellPrice);
  const profit = marginPerUnit(buyPrice, sellPrice);
  let sellHint: ReactNode = `Price per ${per} on orders`;
  if (margin !== null && buyPrice !== null && buyPrice > 0) {
    sellHint =
      profit >= 0 ? (
        <span className={styles.marginGood}>
          Margin {formatPercent(margin, 1)} · {formatMoney(profit)} per {per}
        </span>
      ) : (
        <span className={styles.marginBad}>
          Below the buy price: you lose {formatMoney(-profit)} per {per}
        </span>
      );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? "Edit product" : "Add product"}
      description={product ? product.name : "It shows up when you create orders, with its price and stock."}
      initialFocusRef={nameRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {product ? "Save changes" : "Add product"}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <Field label="Product name" error={errors.name} className={styles.full}>
          <Input
            ref={nameRef}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearError("name");
            }}
            placeholder="e.g. Basmati rice (1 kg)"
            autoComplete="off"
            maxLength={160}
          />
        </Field>
        <Field label="Category" optional hint="Pick one or type a new one" error={errors.category}>
          <Input
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              clearError("category");
            }}
            list={categoryListId}
            placeholder="e.g. Staples"
            autoComplete="off"
            maxLength={160}
          />
        </Field>
        <datalist id={categoryListId}>
          {(categories.data ?? []).map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
        <Field label="Sold by">
          <Select value={unit} onValueChange={setUnit} options={UNIT_OPTIONS} />
        </Field>
        <Field label="Buy price" optional hint={`What you pay per ${per}`} error={errors.buy}>
          <MoneyInput
            value={buyPrice}
            onChange={(value) => {
              setBuyPrice(value);
              clearError("buy");
            }}
          />
        </Field>
        <Field label="Sell price" hint={sellHint} error={errors.sell}>
          <MoneyInput
            ref={sellRef}
            value={sellPrice}
            onChange={(value) => {
              setSellPrice(value);
              clearError("sell");
            }}
          />
        </Field>
        {!product && (
          <Field label="Opening stock" hint="What you have on the shelf now" error={errors.opening}>
            <div onFocus={selectLoneZero}>
              <QuantityInput value={openingStock} onChange={setOpeningStock} step={step} unit={unit} />
            </div>
          </Field>
        )}
        <Field label="Low-stock alert at" hint="Shows under Running low at or below this" error={errors.min}>
          <div onFocus={selectLoneZero}>
            <QuantityInput value={minLevel} onChange={setMinLevel} step={step} unit={unit} />
          </div>
        </Field>
        <Field label="SKU or barcode" optional hint="Type it or scan it" error={errors.sku}>
          <Input
            value={sku}
            onChange={(event) => {
              setSku(event.target.value);
              clearError("sku");
            }}
            className="mono"
            autoComplete="off"
            maxLength={64}
          />
        </Field>
        <FormError message={formError} className={styles.full} />
      </div>
    </Modal>
  );
}
