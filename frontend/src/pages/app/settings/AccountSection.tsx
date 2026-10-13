import { CircleAlert } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Badge, Button, Card, Checkbox, DescriptionList, Field, Input, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { ROLE_LABEL } from "../../../lib/constants";
import { formatPhone } from "../../../lib/format";
import { useChangePassword } from "../../../lib/queries";
import { MIN_PASSWORD_LENGTH } from "../staff/staffUtils";
import styles from "./SettingsPage.module.css";

type PasswordField = "current" | "next" | "confirm";
type PasswordErrors = Partial<Record<PasswordField, string>>;

const PASSWORD_FORM_ID = "change-password-form";

export interface AccountSectionProps {
  id: string;
}

/** Who you are signed in as, and a password change that keeps this device signed in. */
export function AccountSection({ id }: AccountSectionProps) {
  const { user, refresh } = useAuth();
  const changePassword = useChangePassword();
  const toast = useToast();
  const [values, setValues] = useState<Record<PasswordField, string>>({ current: "", next: "", confirm: "" });
  const [showPasswords, setShowPasswords] = useState(false);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const refs = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };

  if (!user) return null;

  const signInWith = [user.phone ? formatPhone(user.phone) : null, user.email].filter(Boolean).join(" or ");

  const set = (field: PasswordField, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
    setFormError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: PasswordErrors = {};
    if (!values.current) found.current = "Enter your current password.";
    if (values.next.length < MIN_PASSWORD_LENGTH) found.next = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    else if (values.next === values.current) found.next = "Choose a password that's different from the current one.";
    if (!found.next && values.confirm !== values.next) found.confirm = "This doesn't match the new password.";
    setErrors(found);
    setFormError(null);
    const first = (["current", "next", "confirm"] as const).find((field) => found[field]);
    if (first) {
      refs[first].current?.focus();
      return;
    }
    changePassword.mutate(
      { current_password: values.current, new_password: values.next },
      {
        onSuccess: async () => {
          // The new token is already stored; re-read the session with it.
          await refresh();
          setValues({ current: "", next: "", confirm: "" });
          setShowPasswords(false);
          toast.success("Password changed", {
            description: "You're still signed in here. Other devices will ask for the new password.",
          });
        },
        onError: (error) => {
          const message = errorMessage(error);
          if (/current password/i.test(message)) {
            setErrors({ current: message });
            refs.current.current?.focus();
          } else if (/characters/i.test(message)) {
            setErrors({ next: message });
            refs.next.current?.focus();
          } else {
            setFormError(message);
          }
        },
      },
    );
  };

  const type = showPasswords ? "text" : "password";

  return (
    <div id={id} tabIndex={-1} className={styles.anchor}>
      <Card title="Your account" description="The login you use for ShopOS.">
        <DescriptionList
          items={[
            { key: "name", label: "Name", value: user.name },
            { key: "role", label: "Role", value: <Badge tone={user.role === "owner" ? "pen" : "neutral"}>{ROLE_LABEL[user.role]}</Badge> },
            { key: "login", label: "Sign in with", value: signInWith ? <span className="mono">{signInWith}</span> : "–" },
          ]}
        />
        <div className={styles.subsection}>
          <h3 className={styles.subheading}>Change password</h3>
          <p className={styles.subdescription}>
            You stay signed in on this device. Anywhere else you're signed in will need the new password.
          </p>
          <form id={PASSWORD_FORM_ID} noValidate onSubmit={handleSubmit} className={styles.passwordGrid} aria-label="Change password">
            {/* Lets password managers file the new password under the right account. */}
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={user.email ?? user.phone ?? ""}
              readOnly
              tabIndex={-1}
              aria-hidden="true"
              className="visually-hidden"
            />
            <Field label="Current password" error={errors.current}>
              <Input
                ref={refs.current}
                type={type}
                value={values.current}
                onChange={(event) => set("current", event.target.value)}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={128}
              />
            </Field>
            <Field label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`} error={errors.next}>
              <Input
                ref={refs.next}
                type={type}
                value={values.next}
                onChange={(event) => set("next", event.target.value)}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={128}
              />
            </Field>
            <Field label="Confirm new password" error={errors.confirm}>
              <Input
                ref={refs.confirm}
                type={type}
                value={values.confirm}
                onChange={(event) => set("confirm", event.target.value)}
                autoComplete="new-password"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={128}
              />
            </Field>
          </form>
          {formError && (
            <p className={`${styles.formError} ${styles.spaced}`} role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{formError}</span>
            </p>
          )}
          <div className={styles.passwordActions}>
            <Checkbox label="Show passwords" checked={showPasswords} onCheckedChange={setShowPasswords} />
            <Button type="submit" form={PASSWORD_FORM_ID} variant="primary" loading={changePassword.isPending}>
              Change password
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
