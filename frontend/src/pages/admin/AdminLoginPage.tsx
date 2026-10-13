import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Info, Terminal } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { Button, Field, Input } from "../../components/ui";
import { adminLogin, adminTokenStore, errorMessage } from "../../lib/api";
import { useDocumentTitle, useMediaQuery } from "../../lib/hooks";
import { queryKeys } from "../../lib/queries";
import { PasswordInput } from "../auth/PasswordInput";
import type { AdminLoginState } from "./AdminLayout";
import styles from "./AdminLogin.module.css";

interface LoginErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): LoginErrors {
  const errors: LoginErrors = {};
  if (!email.trim()) errors.email = "Enter your admin email.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

/** Only admin pages are valid places to go back to after signing in. */
function safeAdminPath(path: string | undefined): string {
  if (!path || !path.startsWith("/admin") || path.startsWith("/admin/login")) return "/admin";
  return path;
}

/** Sign-in for the ShopOS team. Separate from every shop account; there is no sign-up. */
export default function AdminLoginPage() {
  useDocumentTitle("Admin sign in");
  const location = useLocation();
  const state = (location.state ?? {}) as AdminLoginState;
  if (adminTokenStore.get()) return <Navigate to={safeAdminPath(state.from)} replace />;
  return <AdminLoginForm state={state} />;
}

function AdminLoginForm({ state }: { state: AdminLoginState }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const finePointer = useMediaQuery("(pointer: fine)");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const fieldErrors = attempted ? validate(email, password) : {};

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setAttempted(true);
    setFormError(null);
    const errors = validate(email, password);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }
    setPending(true);
    try {
      const { token, admin } = await adminLogin({ email: email.trim(), password });
      adminTokenStore.set(token);
      queryClient.setQueryData(queryKeys.adminMe, admin);
      navigate(safeAdminPath(state.from), { replace: true });
    } catch (error) {
      setPending(false);
      setFormError(errorMessage(error));
      passwordRef.current?.select();
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.band}>
        <span className={styles.awning} aria-hidden="true" />
        <div className={styles.bandInner}>
          <Link to="/" className={styles.logo} aria-label="ShopOS home">
            <Logo tone="dark" size={30} />
          </Link>
          <span className={styles.tag}>Admin</span>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="admin-login-title">
          <h1 id="admin-login-title" className={styles.title}>
            Admin sign in
          </h1>
          <p className={styles.description}>For the ShopOS team. Shop owners and staff sign in on the shop sign-in page.</p>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {state.expired && !formError && (
              <div className={`${styles.alert} ${styles.alertInfo}`} role="status">
                <Info size={18} aria-hidden="true" />
                <span>Your admin session ended. Sign in again to continue.</span>
              </div>
            )}
            {formError && (
              <div className={styles.alert} role="alert">
                <CircleAlert size={18} aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            <Field label="Email" error={fieldErrors.email}>
              <Input
                ref={emailRef}
                size="lg"
                type="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={254}
                autoFocus={finePointer}
              />
            </Field>

            <Field label="Password" error={fieldErrors.password}>
              <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" inputRef={passwordRef} />
            </Field>

            <Button type="submit" variant="primary" size="lg" block loading={pending}>
              Sign in
            </Button>
          </form>
        </section>

        <div className={styles.devNote}>
          <p className={styles.devNoteHead}>
            <Terminal size={16} aria-hidden="true" />
            For developers
          </p>
          <p>There is no admin sign-up. Create an admin on the server:</p>
          <code className={styles.command}>python -m app.admin_cli create --email you@example.com --name "Your name"</code>
        </div>

        <p className={styles.back}>
          <Link to="/login">Go to the shop sign-in</Link>
        </p>
      </main>
    </div>
  );
}
