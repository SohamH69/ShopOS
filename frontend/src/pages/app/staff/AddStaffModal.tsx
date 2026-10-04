import { CircleAlert, UserPlus } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Button, Field, Input, Modal, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { firstName } from "../../../lib/format";
import { useCreateUser } from "../../../lib/queries";
import type { StaffRole, User } from "../../../lib/types";
import { LoginDetails } from "./LoginDetails";
import { RoleChoice } from "./RoleChoice";
import styles from "./StaffPage.module.css";
import { generateTemporaryPassword, isValidEmail, isValidPhone, loginIdentity, MIN_PASSWORD_LENGTH } from "./staffUtils";

type StaffField = "name" | "phone" | "email" | "password";
type FieldErrors = Partial<Record<StaffField, string>>;

interface StaffDraft {
  name: string;
  phone: string;
  email: string;
  password: string;
}

function validate(draft: StaffDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.name.trim()) errors.name = "Enter their name.";
  if (draft.phone.trim() && !isValidPhone(draft.phone)) errors.phone = "Enter a valid phone number with at least 10 digits.";
  if (draft.email.trim() && !isValidEmail(draft.email)) errors.email = "Enter a valid email address.";
  if (!draft.phone.trim() && !draft.email.trim()) errors.phone = "Add a phone number or email they'll sign in with.";
  if (draft.password.length < MIN_PASSWORD_LENGTH) errors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  return errors;
}

const FIELD_ORDER: readonly StaffField[] = ["name", "phone", "email", "password"];

export interface AddStaffModalProps {
  open: boolean;
  onClose: () => void;
}

/** Creates a staff login, then shows the details to share (copy or WhatsApp). */
export function AddStaffModal({ open, onClose }: AddStaffModalProps) {
  const create = useCreateUser();
  const toast = useToast();
  const [draft, setDraft] = useState<StaffDraft>(() => ({ name: "", phone: "", email: "", password: generateTemporaryPassword() }));
  const [role, setRole] = useState<StaffRole>("employee");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ user: User; password: string } | null>(null);

  const refs: Record<StaffField, RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    phone: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };
  const doneRef = useRef<HTMLButtonElement>(null);

  const change = (field: StaffField, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const showErrors = (found: FieldErrors) => {
    setErrors(found);
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) refs[first].current?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    const found = validate(draft);
    if (Object.keys(found).length > 0) {
      showErrors(found);
      return;
    }
    try {
      const user = await create.mutateAsync({
        name: draft.name.trim(),
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        role,
        password: draft.password,
      });
      setCreated({ user, password: draft.password });
      const identity = loginIdentity(user);
      toast.success("Staff added", {
        description: identity ? `Share their login: ${identity.value} / ${draft.password}` : undefined,
      });
    } catch (error) {
      const message = errorMessage(error);
      // The API names the clashing identifier; show it under that field.
      if (/phone/i.test(message)) showErrors({ phone: message });
      else if (/email/i.test(message)) showErrors({ email: message });
      else setFormError(message);
    }
  };

  const startAnother = () => {
    setCreated(null);
    setDraft({ name: "", phone: "", email: "", password: generateTemporaryPassword() });
    setErrors({});
    setFormError(null);
  };

  // The dialog swaps between the form and the login details; move focus into whichever is showing.
  // Runs only when the view changes (not on every keystroke), hence the single dependency.
  const nameRef = refs.name;
  useEffect(() => {
    if (!open) return;
    if (created) doneRef.current?.focus();
    else nameRef.current?.focus();
  }, [created]);

  if (created) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`${firstName(created.user.name) || "They"} can sign in now`}
        description="Share these details with them. They'll need the password to sign in the first time."
        footer={
          <>
            <Button icon={<UserPlus aria-hidden="true" />} onClick={startAnother}>
              Add another
            </Button>
            <Button ref={doneRef} variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        }
      >
        <LoginDetails
          name={created.user.name}
          phone={created.user.phone}
          email={created.user.email}
          password={created.password}
        />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add staff"
      description="They sign in with their own phone number or email, so add at least one."
      initialFocusRef={refs.name}
      onSubmit={(event) => void handleSubmit(event)}
      footer={
        <>
          <Button onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={create.isPending}>
            Add staff
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field label="Name" error={errors.name}>
          <Input
            ref={refs.name}
            value={draft.name}
            onChange={(event) => change("name", event.target.value)}
            autoComplete="off"
            maxLength={160}
            placeholder="Arjun Pawar"
          />
        </Field>
        <div className={styles.pair}>
          <Field label="Phone" error={errors.phone}>
            <Input
              ref={refs.phone}
              type="tel"
              inputMode="tel"
              value={draft.phone}
              onChange={(event) => change("phone", event.target.value)}
              autoComplete="off"
              maxLength={20}
              placeholder="98765 43210"
            />
          </Field>
          <Field label="Email" error={errors.email}>
            <Input
              ref={refs.email}
              type="email"
              inputMode="email"
              value={draft.email}
              onChange={(event) => change("email", event.target.value)}
              autoComplete="off"
              maxLength={254}
              placeholder="arjun@example.com"
            />
          </Field>
        </div>
        <RoleChoice value={role} onChange={setRole} />
        <Field
          label="Temporary password"
          hint="At least 8 characters. They can change it after signing in."
          error={errors.password}
          action={
            <button type="button" className={styles.linkButton} onClick={() => change("password", generateTemporaryPassword())}>
              Make a new one
            </button>
          }
        >
          <Input
            ref={refs.password}
            className={styles.mono}
            value={draft.password}
            onChange={(event) => change("password", event.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={128}
            data-1p-ignore=""
            data-lpignore="true"
          />
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
