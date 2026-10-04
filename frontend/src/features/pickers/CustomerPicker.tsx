import { UserPlus, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Avatar, Button, Combobox, Field, Input, Money, useToast, type ComboboxAction } from "../../components/ui";
import { assignRef } from "../../components/ui/utils";
import { errorMessage } from "../../lib/api";
import { formatMoney, formatPhone, phoneDigits } from "../../lib/format";
import { useDebouncedValue } from "../../lib/hooks";
import { useCreateCustomer, useCustomers } from "../../lib/queries";
import type { Customer } from "../../lib/types";
import styles from "./Pickers.module.css";

export interface CustomerPickerProps {
  /** The chosen customer, or null (walk-in / not chosen yet). */
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  /** Offer "Walk-in (no customer)" before anything is typed. */
  allowWalkIn?: boolean;
  /** Called when "Walk-in" is chosen (value becomes null). */
  onWalkIn?: () => void;
  /** Offer "Add new customer" with an inline name + phone form. Default true. */
  allowCreate?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** The search field, e.g. to focus it from a parent. */
  inputRef?: Ref<HTMLInputElement>;
}

const RESULT_LIMIT = 8;
const RECENT_LIMIT = 6;

function CustomerOption({ customer }: { customer: Customer }) {
  return (
    <span className={styles.option}>
      <Avatar name={customer.name} size="sm" />
      <span className={styles.optionMain}>
        <span className={styles.optionName}>{customer.name}</span>
        <span className={`${styles.optionMeta} mono`}>{formatPhone(customer.phone)}</span>
      </span>
      {customer.outstanding > 0 && (
        <span className={styles.optionAside}>
          <Money value={customer.outstanding} tone="margin" size="sm" />
          <span className={styles.due}>due</span>
        </span>
      )}
    </span>
  );
}

interface NewCustomerFormProps {
  initialQuery: string;
  onCreated: (customer: Customer) => void;
  onCancel: () => void;
}

/** Inline name + phone form. Not a <form>, so it can live inside another form (the new order sheet). */
function NewCustomerForm({ initialQuery, onCreated, onCancel }: NewCustomerFormProps) {
  const looksLikePhone = phoneDigits(initialQuery).length >= 5;
  const [name, setName] = useState(looksLikePhone ? "" : initialQuery.trim());
  const [phone, setPhone] = useState(looksLikePhone ? initialQuery.trim() : "");
  const [error, setError] = useState<string | null>(null);
  const createCustomer = useCreateCustomer();
  const toast = useToast();

  const submit = async () => {
    if (!name.trim()) {
      setError("Enter the customer's name.");
      return;
    }
    if (phoneDigits(phone).length < 10) {
      setError("Enter a 10-digit mobile number.");
      return;
    }
    setError(null);
    try {
      const customer = await createCustomer.mutateAsync({ name: name.trim(), phone: phone.trim() });
      toast.success(`${customer.name} added as a customer`);
      onCreated(customer);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      // Close this form only, not the sheet around it.
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className={styles.create} role="group" aria-label="New customer" onKeyDown={handleKeyDown}>
      <p className={styles.createTitle}>New customer</p>
      <div className={styles.createFields}>
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" autoFocus={!looksLikePhone} />
        </Field>
        <Field label="Phone">
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            autoFocus={looksLikePhone}
          />
        </Field>
      </div>
      {error && (
        <p className={styles.createError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.createActions}>
        <Button size="sm" variant="primary" loading={createCustomer.isPending} onClick={() => void submit()}>
          Add customer
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={createCustomer.isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Pick a customer by name or phone. Shows recent customers before typing, phone and dues in each row,
 * optional "Walk-in" and an inline "Add new customer" form. Once chosen, shows the customer with a Change button.
 */
export function CustomerPicker({
  value,
  onChange,
  allowWalkIn = false,
  onWalkIn,
  allowCreate = true,
  autoFocus,
  placeholder = "Search by name or phone",
  disabled,
  invalid,
  id,
  inputRef,
}: CustomerPickerProps) {
  const [query, setQuery] = useState("");
  const [creatingFrom, setCreatingFrom] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const focusSearchNext = useRef(false);
  const term = useDebouncedValue(query.trim(), 200);
  const customers = useCustomers(term ? { search: term } : { sort: "recent" }, { enabled: !value && creatingFrom === null });

  useEffect(() => {
    if (!value && creatingFrom === null && focusSearchNext.current) {
      focusSearchNext.current = false;
      searchRef.current?.focus();
    }
  }, [value, creatingFrom]);

  if (value) {
    return (
      <div className={styles.selected}>
        <Avatar name={value.name} />
        <span className={styles.selectedText}>
          <span className={styles.selectedName}>{value.name}</span>
          <span className={styles.selectedMeta}>
            <span className="mono">{formatPhone(value.phone)}</span>
            {value.outstanding > 0 && <span className={styles.selectedDue}> · {formatMoney(value.outstanding)} already due</span>}
          </span>
        </span>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            focusSearchNext.current = true;
            onChange(null);
          }}
        >
          Change
        </Button>
      </div>
    );
  }

  if (creatingFrom !== null) {
    return (
      <NewCustomerForm
        initialQuery={creatingFrom}
        onCancel={() => {
          focusSearchNext.current = true;
          setCreatingFrom(null);
        }}
        onCreated={(customer) => {
          setCreatingFrom(null);
          setQuery("");
          onChange(customer);
        }}
      />
    );
  }

  const options = (customers.data ?? []).slice(0, term ? RESULT_LIMIT : RECENT_LIMIT);
  const leadingActions: ComboboxAction[] =
    allowWalkIn && !query.trim()
      ? [
          {
            key: "walk-in",
            label: "Walk-in (no customer)",
            icon: <UserRound />,
            onSelect: () => {
              onChange(null);
              onWalkIn?.();
            },
          },
        ]
      : [];
  const trailingActions: ComboboxAction[] = allowCreate
    ? [
        {
          key: "create",
          label: query.trim() ? `Add “${query.trim()}” as a new customer` : "Add new customer",
          icon: <UserPlus />,
          onSelect: (text) => setCreatingFrom(text),
        },
      ]
    : [];

  return (
    <Combobox<Customer>
      id={id}
      inputRef={(node) => {
        searchRef.current = node;
        assignRef(inputRef, node);
      }}
      label="Customer"
      inputValue={query}
      onInputChange={setQuery}
      options={options}
      getOptionKey={(customer) => customer.id}
      renderOption={(customer) => <CustomerOption customer={customer} />}
      onSelect={(customer) => {
        setQuery("");
        onChange(customer);
      }}
      leadingActions={leadingActions}
      trailingActions={trailingActions}
      loading={Boolean(query.trim()) && (customers.isFetching || term !== query.trim())}
      emptyMessage={customers.isError ? errorMessage(customers.error) : `No customer matches “${query.trim()}”.`}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      invalid={invalid}
    />
  );
}
