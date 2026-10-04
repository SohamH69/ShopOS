import { CircleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, Input, Modal, Textarea, useToast } from "../../../components/ui";
import { errorMessage, isApiError } from "../../../lib/api";
import { phoneDigits } from "../../../lib/format";
import { useCreateCustomer, useUpdateCustomer } from "../../../lib/queries";
import type { Customer, CustomerInput } from "../../../lib/types";
import styles from "./Dialogs.module.css";
import { useOpenSession } from "./useOpenSession";

export interface CustomerFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Edit this customer; without it the modal adds a new one. */
  customer?: Customer | null;
  /** Called with the saved customer after the success toast. */
  onSaved?: (customer: Customer) => void;
}

type FieldName = "name" | "phone" | "address" | "notes" | "products";
type FormErrors = Partial<Record<FieldName | "form", string>>;

interface FormValues {
  name: string;
  phone: string;
  address: string;
  notes: string;
  products: string;
}

const API_FIELD: Readonly<Record<string, FieldName>> = {
  name: "name",
  phone: "phone",
  address: "address",
  notes: "notes",
  preferred_products: "products",
};

/** "Basmati rice, amul butter , Basmati Rice" → ["Basmati rice", "amul butter"]. */
function parseProducts(text: string): string[] {
  const seen = new Map<string, string>();
  for (const part of text.split(",")) {
    const product = part.trim().replace(/\s+/g, " ");
    if (product && !seen.has(product.toLowerCase())) seen.set(product.toLowerCase(), product);
  }
  return [...seen.values()];
}

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = "Enter the customer's name.";
  const digits = phoneDigits(values.phone).length;
  if (!values.phone.trim()) errors.phone = "Enter a phone number.";
  else if (digits < 10 || digits > 15) errors.phone = "Enter a valid phone number with at least 10 digits.";
  if (parseProducts(values.products).length > 50) errors.products = "Keep it to 50 products or fewer.";
  return errors;
}

/** Puts a server error next to the field it is about, when it is about one. */
function errorsFromApi(error: unknown): FormErrors {
  if (!isApiError(error)) return { form: errorMessage(error) };
  if (error.fieldErrors) {
    const mapped: FormErrors = {};
    for (const [path, message] of Object.entries(error.fieldErrors)) {
      const field = API_FIELD[path.split(".")[0] ?? ""];
      if (field && !mapped[field]) mapped[field] = message;
    }
    if (Object.keys(mapped).length > 0) return mapped;
  }
  if (error.status === 409 || /phone/i.test(error.message)) return { phone: error.message };
  if (/name/i.test(error.message)) return { name: error.message };
  return { form: error.message };
}

function initialValues(customer: Customer | null | undefined): FormValues {
  return {
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    address: customer?.address ?? "",
    notes: customer?.notes ?? "",
    products: customer?.preferred_products.join(", ") ?? "",
  };
}

/** Add or edit a customer: name, phone, address, notes and the products they usually buy. */
export function CustomerFormModal(props: CustomerFormModalProps) {
  const session = useOpenSession(props.open);
  return <CustomerFormDialog key={session} {...props} />;
}

function CustomerFormDialog({ open, onClose, customer, onSaved }: CustomerFormModalProps) {
  const editing = Boolean(customer);
  const [values, setValues] = useState<FormValues>(() => initialValues(customer));
  const [errors, setErrors] = useState<FormErrors>({});
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const toast = useToast();
  const navigate = useNavigate();
  const pending = createCustomer.isPending || updateCustomer.isPending;

  const setValue = (field: FieldName, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    if (errors[field] || errors.form) setErrors((previous) => ({ ...previous, [field]: undefined, form: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const found = validate(values);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    const body: CustomerInput = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      address: values.address.trim(),
      notes: values.notes.trim(),
      preferred_products: parseProducts(values.products),
    };
    try {
      if (customer) {
        const saved = await updateCustomer.mutateAsync({ id: customer.id, ...body });
        toast.success("Changes saved");
        onSaved?.(saved);
      } else {
        const saved = await createCustomer.mutateAsync(body);
        toast.success(`${saved.name} added as a customer`, {
          action: { label: "Open khata", onClick: () => navigate(`/app/customers/${saved.id}`) },
        });
        onSaved?.(saved);
      }
      onClose();
    } catch (caught) {
      setErrors(errorsFromApi(caught));
    }
  };

  return (
    <Modal
      open={open}
      onClose={pending ? () => undefined : onClose}
      title={editing ? "Edit customer" : "Add customer"}
      description={editing ? undefined : "Their khata starts with their first order."}
      onSubmit={(event) => void handleSubmit(event)}
      footer={
        <>
          <Button onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {editing ? "Save changes" : "Add customer"}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <div className={styles.pair}>
          <Field label="Name" required error={errors.name}>
            <Input
              value={values.name}
              onChange={(event) => setValue("name", event.target.value)}
              autoComplete="off"
              maxLength={160}
              autoFocus
            />
          </Field>
          <Field label="Phone" required error={errors.phone}>
            <Input
              value={values.phone}
              onChange={(event) => setValue("phone", event.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              maxLength={20}
              placeholder="98765 43210"
            />
          </Field>
        </div>
        <Field label="Address" optional error={errors.address}>
          <Textarea
            value={values.address}
            onChange={(event) => setValue("address", event.target.value)}
            rows={2}
            maxLength={500}
          />
        </Field>
        <Field
          label="Usually buys"
          optional
          hint="Separate with commas, for example: Basmati rice, Amul butter"
          error={errors.products}
        >
          <Input value={values.products} onChange={(event) => setValue("products", event.target.value)} autoComplete="off" />
        </Field>
        <Field label="Notes" optional hint="Only you and your staff see this." error={errors.notes}>
          <Textarea
            value={values.notes}
            onChange={(event) => setValue("notes", event.target.value)}
            rows={2}
            maxLength={2000}
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
