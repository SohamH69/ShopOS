import { useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Field, Input, Select, useToast } from "../../components/ui";
import { errorMessage, isApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { SEGMENTS } from "../../lib/constants";
import { phoneDigits } from "../../lib/format";
import { useDocumentTitle } from "../../lib/hooks";
import styles from "./Auth.module.css";
import { AuthLayout, FormAlert } from "./AuthLayout";
import { PasswordInput } from "./PasswordInput";
import signupStyles from "./Signup.module.css";

interface SignupForm {
  shopName: string;
  ownerName: string;
  phone: string;
  email: string;
  city: string;
  segment: string;
  password: string;
}

type SignupField = keyof SignupForm;
type SignupErrors = Partial<Record<SignupField, string>>;

const MIN_PASSWORD = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEGMENT_OPTIONS = SEGMENTS.map((segment) => ({ value: segment, label: segment }));

/** Fields in the order they appear, for focusing the first problem. */
const FIELD_ORDER: readonly SignupField[] = ["shopName", "ownerName", "phone", "email", "city", "segment", "password"];

/** API field names (422 responses) → form fields. */
const API_FIELDS: Readonly<Record<string, SignupField>> = {
  shop_name: "shopName",
  owner_name: "ownerName",
  phone: "phone",
  email: "email",
  city: "city",
  segment: "segment",
  password: "password",
};

// Mirrors the server's rules, so most mistakes are caught before a round trip.
function validate(form: SignupForm): SignupErrors {
  const errors: SignupErrors = {};
  if (!form.shopName.trim()) errors.shopName = "Enter your shop's name.";
  if (!form.ownerName.trim()) errors.ownerName = "Enter your name.";
  const digits = phoneDigits(form.phone);
  if (!form.phone.trim()) errors.phone = "Enter a phone number.";
  else if (digits.length < 10 || digits.length > 15) errors.phone = "Enter a valid phone number with at least 10 digits.";
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (!form.city.trim()) errors.city = "Enter your city or town.";
  if (form.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters for the password.`;
  return errors;
}

export default function SignupPage() {
  useDocumentTitle("Create your shop account");
  const { signup: createAccount } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const next = params.get("next");

  const [form, setForm] = useState<SignupForm>({
    shopName: "",
    ownerName: "",
    phone: "",
    email: "",
    city: "",
    segment: SEGMENTS[0],
    password: "",
  });
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<SignupErrors>({});
  const [formError, setFormError] = useState<{ message: string; existingAccount: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fieldRefs = useRef<Partial<Record<SignupField, HTMLInputElement | HTMLSelectElement | null>>>({});

  const errors: SignupErrors = { ...serverErrors, ...(attempted ? validate(form) : {}) };

  const update = (field: SignupField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (serverErrors[field]) {
      setServerErrors((current) => {
        const remaining = { ...current };
        delete remaining[field];
        return remaining;
      });
    }
  };

  const bindRef = (field: SignupField) => (node: HTMLInputElement | HTMLSelectElement | null) => {
    fieldRefs.current[field] = node;
  };

  const focusFirst = (found: SignupErrors) => {
    const first = FIELD_ORDER.find((field) => found[field]);
    if (first) fieldRefs.current[first]?.focus();
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setAttempted(true);
    setFormError(null);
    setServerErrors({});
    const found = validate(form);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }
    setSubmitting(true);
    try {
      await createAccount({
        shop_name: form.shopName.trim(),
        owner_name: form.ownerName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        city: form.city.trim(),
        segment: form.segment,
        password: form.password,
      });
      toast.success("Account created", { description: "Your shop is ready. Add your products and customers to get going." });
      // Signed in: the route guard opens the app.
    } catch (error) {
      setSubmitting(false);
      const mapped: SignupErrors = {};
      if (isApiError(error) && error.fieldErrors) {
        for (const [key, message] of Object.entries(error.fieldErrors)) {
          const field = API_FIELDS[key];
          if (field) mapped[field] = message;
        }
      }
      setServerErrors(mapped);
      setFormError({ message: errorMessage(error), existingAccount: isApiError(error) && error.status === 409 });
      focusFirst(mapped);
    }
  }

  const loginLink = { pathname: "/login", search: next ? `?next=${encodeURIComponent(next)}` : "" };

  return (
    <AuthLayout
      title="Create your shop account"
      description="Set up ShopOS for your shop in a minute. Free to start."
      footer={
        <>
          Already have an account? <Link to={loginLink}>Sign in</Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {formError && (
          <FormAlert>
            {formError.message}
            {formError.existingAccount && (
              <>
                {" "}
                <Link to={loginLink}>Go to sign in</Link>
              </>
            )}
          </FormAlert>
        )}

        <Field label="Shop name" error={errors.shopName}>
          <Input
            ref={bindRef("shopName")}
            size="lg"
            value={form.shopName}
            onChange={(event) => update("shopName", event.target.value)}
            autoComplete="organization"
            maxLength={160}
            placeholder="Raj Local Mart"
          />
        </Field>

        <Field label="Your name" error={errors.ownerName}>
          <Input
            ref={bindRef("ownerName")}
            size="lg"
            value={form.ownerName}
            onChange={(event) => update("ownerName", event.target.value)}
            autoComplete="name"
            maxLength={160}
          />
        </Field>

        <Field label="Phone" hint="You'll sign in with this number." error={errors.phone}>
          <Input
            ref={bindRef("phone")}
            size="lg"
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => update("phone", event.target.value)}
            autoComplete="tel"
            maxLength={20}
            placeholder="98765 43210"
          />
        </Field>

        <Field label="Email" optional hint="You can sign in with this too." error={errors.email}>
          <Input
            ref={bindRef("email")}
            size="lg"
            type="email"
            inputMode="email"
            value={form.email}
            onChange={(event) => update("email", event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={254}
          />
        </Field>

        <div className={signupStyles.pair}>
          <Field label="City" error={errors.city}>
            <Input
              ref={bindRef("city")}
              size="lg"
              value={form.city}
              onChange={(event) => update("city", event.target.value)}
              autoComplete="address-level2"
              maxLength={160}
              placeholder="Pune"
            />
          </Field>
          <Field label="Shop type" error={errors.segment}>
            <Select
              ref={bindRef("segment")}
              size="lg"
              value={form.segment}
              options={SEGMENT_OPTIONS}
              onValueChange={(value) => update("segment", value)}
            />
          </Field>
        </div>

        <Field label="Password" hint={`At least ${MIN_PASSWORD} characters.`} error={errors.password}>
          <PasswordInput
            value={form.password}
            onChange={(value) => update("password", value)}
            autoComplete="new-password"
            inputRef={bindRef("password")}
          />
        </Field>

        <Button type="submit" variant="primary" size="lg" block loading={submitting}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
