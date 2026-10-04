import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field, Input } from "../../components/ui";
import { errorMessage, isApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useDocumentTitle, useMediaQuery } from "../../lib/hooks";
import styles from "./Auth.module.css";
import { AuthLayout, FormAlert, OrDivider } from "./AuthLayout";
import { PasswordInput } from "./PasswordInput";

interface LoginErrors {
  identifier?: string;
  password?: string;
}

function validate(identifier: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!identifier.trim()) errors.identifier = "Enter your phone number or email.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export default function LoginPage() {
  useDocumentTitle("Sign in");
  const { login, demoLogin, signedOutBy } = useAuth();
  const [params] = useSearchParams();
  const next = params.get("next");
  // Desktop: start typing straight away. Phones: don't throw the keyboard over the demo option.
  const finePointer = useMediaQuery("(pointer: fine)");

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<LoginErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<"login" | "demo" | null>(null);
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // After the first try, field errors update as the user types.
  const fieldErrors: LoginErrors = { ...serverErrors, ...(attempted ? validate(identifier, password) : {}) };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setAttempted(true);
    setFormError(null);
    setServerErrors({});
    const errors = validate(identifier, password);
    if (errors.identifier) {
      identifierRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }
    setPending("login");
    try {
      await login({ identifier: identifier.trim(), password });
      // Signed in: the route guard takes the user on to ?next= or /app.
    } catch (error) {
      setPending(null);
      setFormError(errorMessage(error));
      if (isApiError(error) && error.fieldErrors) {
        setServerErrors({ identifier: error.fieldErrors.identifier, password: error.fieldErrors.password });
      }
      passwordRef.current?.select();
    }
  }

  async function handleDemo() {
    if (pending) return;
    setFormError(null);
    setPending("demo");
    try {
      await demoLogin();
    } catch (error) {
      setPending(null);
      setFormError(errorMessage(error, "The demo shop didn't open. Try again."));
    }
  }

  const signupLink = { pathname: "/signup", search: next ? `?next=${encodeURIComponent(next)}` : "" };

  return (
    <AuthLayout
      title="Sign in to your shop"
      description="Use the phone number or email you signed up with."
      footer={
        <>
          New to ShopOS? <Link to={signupLink}>Create your shop account</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {signedOutBy === "expiry" && !formError && (
          <FormAlert tone="info">Your session ended. Sign in again to continue.</FormAlert>
        )}
        {formError && <FormAlert>{formError}</FormAlert>}

        <Field label="Phone or email" error={fieldErrors.identifier}>
          <Input
            ref={identifierRef}
            size="lg"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            autoFocus={finePointer}
          />
        </Field>

        <Field label="Password" error={fieldErrors.password}>
          <PasswordInput
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            inputRef={passwordRef}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block loading={pending === "login"} disabled={pending === "demo"}>
          Sign in
        </Button>

        <OrDivider />

        <div className={styles.demo}>
          <Button size="lg" block onClick={handleDemo} loading={pending === "demo"} disabled={pending === "login"}>
            Try the demo shop
          </Button>
          <p className={styles.demoHint}>
            Demo: <span className="mono">demo@shopos.app</span> / <span className="mono">demo1234</span>
          </p>
        </div>
      </form>
    </AuthLayout>
  );
}
