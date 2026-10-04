import { CircleAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Field, Input, Modal, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { ROLE_LABEL } from "../../../lib/constants";
import { firstName } from "../../../lib/format";
import { useUpdateUser } from "../../../lib/queries";
import type { StaffRole, User } from "../../../lib/types";
import { LoginDetails } from "./LoginDetails";
import { RoleChoice } from "./RoleChoice";
import styles from "./StaffPage.module.css";
import { generateTemporaryPassword, MIN_PASSWORD_LENGTH, withArticle } from "./staffUtils";

export interface StaffActionModalProps {
  user: User;
  open: boolean;
  onClose: () => void;
}

function FormError({ children }: { children: ReactNode }) {
  return (
    <p className={styles.formError} role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Change role
// ---------------------------------------------------------------------------

export function ChangeRoleModal({ user, open, onClose }: StaffActionModalProps) {
  const update = useUpdateUser();
  const toast = useToast();
  const currentRole: StaffRole = user.role === "owner" ? "manager" : user.role;
  const [role, setRole] = useState<StaffRole>(currentRole);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    update.mutate(
      { id: user.id, role },
      {
        onSuccess: (saved) => {
          toast.success("Role changed", { description: `${saved.name} is now ${withArticle(ROLE_LABEL[saved.role])}.` });
          onClose();
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Change ${firstName(user.name) || user.name}'s role`}
      description="What they can open changes straight away."
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={update.isPending} disabled={role === currentRole}>
            Change role
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <RoleChoice value={role} onChange={setRole} legend={`${user.name}'s role`} />
        {error && <FormError>{error}</FormError>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit name
// ---------------------------------------------------------------------------

export function EditNameModal({ user, open, onClose }: StaffActionModalProps) {
  const update = useUpdateUser();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const unchanged = name.trim() === user.name;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Enter their name.");
      inputRef.current?.focus();
      return;
    }
    setError(null);
    update.mutate(
      { id: user.id, name: name.trim() },
      {
        onSuccess: () => {
          toast.success("Name saved");
          onClose();
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Edit name"
      description="This is the name on orders and payments they take."
      initialFocusRef={inputRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={update.isPending} disabled={unchanged}>
            Save name
          </Button>
        </>
      }
    >
      <Field label="Name" error={error}>
        <Input
          ref={inputRef}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          autoComplete="off"
          maxLength={160}
        />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reset password
// ---------------------------------------------------------------------------

export function ResetPasswordModal({ user, open, onClose }: StaffActionModalProps) {
  const update = useUpdateUser();
  const toast = useToast();
  const [password, setPassword] = useState(() => generateTemporaryPassword());
  const [error, setError] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const name = firstName(user.name) || user.name;

  useEffect(() => {
    if (open && savedPassword) doneRef.current?.focus();
  }, [open, savedPassword]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    update.mutate(
      { id: user.id, password },
      {
        onSuccess: () => {
          setSavedPassword(password);
          toast.success("Password reset", { description: `Share the new password with ${name}.` });
        },
        onError: (failure) => setError(errorMessage(failure)),
      },
    );
  };

  if (savedPassword) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={`New password for ${name}`}
        description="They've been signed out everywhere. Share these details so they can sign in again."
        footer={
          <Button ref={doneRef} variant="primary" onClick={onClose}>
            Done
          </Button>
        }
      >
        <LoginDetails name={user.name} phone={user.phone} email={user.email} password={savedPassword} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Reset ${name}'s password`}
      description="They'll be signed out on every device and need this new password to sign in."
      initialFocusRef={inputRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={update.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <Field
          label="New temporary password"
          hint="At least 8 characters. They can change it after signing in."
          error={error}
          action={
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => {
                setPassword(generateTemporaryPassword());
                setError(null);
              }}
            >
              Make a new one
            </button>
          }
        >
          <Input
            ref={inputRef}
            className={styles.mono}
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setError(null);
            }}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="none"
            maxLength={128}
            data-1p-ignore=""
            data-lpignore="true"
          />
        </Field>
      </div>
    </Modal>
  );
}
