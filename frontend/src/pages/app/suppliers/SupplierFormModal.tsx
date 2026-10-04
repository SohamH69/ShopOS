import { useRef, useState, type FormEvent } from "react";
import { Button, Field, Input, Modal, MoneyInput, Textarea, useToast } from "../../../components/ui";
import { errorMessage, isApiError } from "../../../lib/api";
import { formatMoney, phoneDigits } from "../../../lib/format";
import { useCreateSupplier, useUpdateSupplier } from "../../../lib/queries";
import type { Supplier } from "../../../lib/types";
import { FormError } from "../products/FormError";
import styles from "./SupplierFormModal.module.css";

type FieldName = "name" | "phone" | "contact" | "supplies" | "address" | "notes" | "opening";
type FieldErrors = Partial<Record<FieldName, string>>;

// 422 field paths from the API, mapped to the fields on this form.
const SERVER_FIELDS: Readonly<Record<string, FieldName>> = {
  name: "name",
  phone: "phone",
  contact_person: "contact",
  supplies: "supplies",
  address: "address",
  notes: "notes",
  opening_balance: "opening",
};

export interface SupplierFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The supplier to edit; without it the form adds a new supplier. */
  supplier?: Supplier;
  /** Called with the saved supplier after the modal closes. */
  onSaved?: (supplier: Supplier) => void;
}

/** Add a supplier (with what you already owe them), or edit their contact details. */
export function SupplierFormModal({ open, onClose, supplier, onSaved }: SupplierFormModalProps) {
  const toast = useToast();
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [contact, setContact] = useState(supplier?.contact_person ?? "");
  const [supplies, setSupplies] = useState(supplier?.supplies ?? "");
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [notes, setNotes] = useState(supplier?.notes ?? "");
  const [opening, setOpening] = useState<number | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const saving = createSupplier.isPending || updateSupplier.isPending;

  const clearError = (field: FieldName) => {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) next.name = "Enter the supplier's name.";
    const digits = phoneDigits(phone);
    if (!phone.trim()) next.phone = "Enter the supplier's phone number.";
    else if (digits.length < 10 || digits.length > 15) next.phone = "Enter a valid phone number with at least 10 digits.";
    return next;
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
    if (problems.name) {
      nameRef.current?.focus();
      return;
    }
    if (problems.phone) {
      phoneRef.current?.focus();
      return;
    }
    setFormError(null);
    const fields = {
      name: name.trim(),
      phone: phone.trim(),
      contact_person: contact.trim() || null,
      supplies: supplies.trim(),
      address: address.trim(),
      notes: notes.trim(),
    };
    try {
      if (supplier) {
        const saved = await updateSupplier.mutateAsync({ id: supplier.id, ...fields });
        toast.success("Changes saved", { description: saved.name });
        onClose();
        onSaved?.(saved);
      } else {
        const created = await createSupplier.mutateAsync({ ...fields, opening_balance: opening ?? 0 });
        toast.success("Supplier added", {
          description: created.outstanding > 0 ? `${created.name} · you owe ${formatMoney(created.outstanding)}` : created.name,
        });
        onClose();
        onSaved?.(created);
      }
    } catch (error) {
      showServerError(error);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplier ? "Edit supplier" : "Add supplier"}
      description={supplier ? supplier.name : "A wholesaler or distributor you buy stock from."}
      initialFocusRef={nameRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {supplier ? "Save changes" : "Add supplier"}
          </Button>
        </>
      }
    >
      <div className={styles.grid}>
        <Field label="Supplier name" error={errors.name}>
          <Input
            ref={nameRef}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearError("name");
            }}
            placeholder="e.g. Agarwal Traders"
            autoComplete="organization"
            maxLength={160}
          />
        </Field>
        <Field label="Phone" error={errors.phone}>
          <Input
            ref={phoneRef}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              clearError("phone");
            }}
            placeholder="98765 43210"
            maxLength={40}
          />
        </Field>
        <Field label="Contact person" optional error={errors.contact}>
          <Input
            value={contact}
            onChange={(event) => {
              setContact(event.target.value);
              clearError("contact");
            }}
            placeholder="Who you speak to"
            autoComplete="name"
            maxLength={160}
          />
        </Field>
        <Field label="What they supply" optional error={errors.supplies}>
          <Input
            value={supplies}
            onChange={(event) => {
              setSupplies(event.target.value);
              clearError("supplies");
            }}
            placeholder="e.g. Rice, dal, flour"
            maxLength={500}
          />
        </Field>
        <Field label="Address" optional error={errors.address} className={styles.full}>
          <Textarea
            rows={2}
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              clearError("address");
            }}
            autoComplete="street-address"
            maxLength={500}
          />
        </Field>
        <Field label="Notes" optional error={errors.notes} className={styles.full}>
          <Textarea
            rows={2}
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
              clearError("notes");
            }}
            placeholder="e.g. Delivers on Tuesdays, 30 days credit"
            maxLength={2000}
          />
        </Field>
        {!supplier && (
          <Field label="Opening balance" optional hint="Money you already owe them from before" error={errors.opening}>
            <MoneyInput
              value={opening}
              onChange={(value) => {
                setOpening(value);
                clearError("opening");
              }}
            />
          </Field>
        )}
        <FormError message={formError} className={styles.full} />
      </div>
    </Modal>
  );
}
