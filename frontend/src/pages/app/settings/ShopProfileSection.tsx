import { CircleAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
// import { Link } from "react-router-dom"; // used by the hidden "Change plan" link
import {
  Badge,
  Button,
  Card,
  DescriptionList,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "../../../components/ui";
import { errorMessage, isApiError } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { PLAN_LABEL, SEGMENTS } from "../../../lib/constants";
import { formatPhone } from "../../../lib/format";
import { useShop, useUpdateShop } from "../../../lib/queries";
import type { Shop, ShopUpdate } from "../../../lib/types";
import { isValidEmail, isValidPhone } from "../staff/staffUtils";
import styles from "./SettingsPage.module.css";
import { UpiQrPreview } from "./UpiQrPreview";

const OTHER_SEGMENT = "Other";
const FORM_ID = "shop-profile-form";
// Same rule as the API.
const UPI_PATTERN = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/;

type ProfileField = "name" | "owner_name" | "phone" | "email" | "address" | "city" | "segment" | "upi_id";
type ProfileErrors = Partial<Record<ProfileField, string>>;

interface ProfileDraft {
  name: string;
  owner_name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  segmentChoice: string;
  segmentOther: string;
  upi_id: string;
}

function draftFrom(shop: Shop): ProfileDraft {
  const listed = SEGMENTS.includes(shop.segment) && shop.segment !== OTHER_SEGMENT;
  return {
    name: shop.name,
    owner_name: shop.owner_name,
    phone: shop.phone,
    email: shop.email ?? "",
    address: shop.address,
    city: shop.city,
    segmentChoice: listed ? shop.segment : OTHER_SEGMENT,
    segmentOther: listed || shop.segment === OTHER_SEGMENT ? "" : shop.segment,
    upi_id: shop.upi_id ?? "",
  };
}

function toUpdate(draft: ProfileDraft): Required<ShopUpdate> {
  return {
    name: draft.name.trim(),
    owner_name: draft.owner_name.trim(),
    phone: draft.phone.trim(),
    email: draft.email.trim() || null,
    address: draft.address.trim(),
    city: draft.city.trim(),
    segment: draft.segmentChoice === OTHER_SEGMENT ? draft.segmentOther.trim() || OTHER_SEGMENT : draft.segmentChoice,
    upi_id: draft.upi_id.trim() || null,
  };
}

/** Only the fields that changed, so a save never overwrites edits made on another device. */
function changes(draft: ProfileDraft, shop: Shop): ShopUpdate {
  const next = toUpdate(draft);
  const before = toUpdate(draftFrom(shop));
  const update: Record<string, string | null> = {};
  for (const key of Object.keys(next) as (keyof ShopUpdate)[]) {
    if (next[key] !== before[key]) update[key] = next[key];
  }
  return update as ShopUpdate;
}

function validate(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!draft.name.trim()) errors.name = "Enter your shop's name.";
  if (!draft.owner_name.trim()) errors.owner_name = "Enter the owner's name.";
  if (!draft.phone.trim()) errors.phone = "Enter the shop's phone number.";
  else if (!isValidPhone(draft.phone)) errors.phone = "Enter a valid phone number with at least 10 digits.";
  if (draft.email.trim() && !isValidEmail(draft.email)) errors.email = "Enter a valid email address.";
  if (draft.upi_id.trim() && !UPI_PATTERN.test(draft.upi_id.trim())) errors.upi_id = "Enter a valid UPI ID, like yourshop@upi.";
  return errors;
}

/** Which field an API message is about, so it shows under that field. */
function fieldForMessage(message: string): ProfileField | null {
  if (/upi/i.test(message)) return "upi_id";
  if (/email/i.test(message)) return "email";
  if (/phone/i.test(message)) return "phone";
  if (/owner/i.test(message)) return "owner_name";
  if (/shop's name/i.test(message)) return "name";
  return null;
}

function PlanRow({ shop }: { shop: Shop }) {
  return (
    <div className={styles.planRow}>
      <span className={styles.planLabel}>Plan</span>
      <Badge tone="pen">{PLAN_LABEL[shop.plan]}</Badge>
      {/* Hidden with the pricing section.
      <Link to="/#pricing" className={styles.planLink}>
        Change plan
      </Link>
      */}
    </div>
  );
}

export interface ShopProfileSectionProps {
  id: string;
}

/** Shop details used on receipts and WhatsApp messages. Editable with the settings permission. */
export function ShopProfileSection({ id }: ShopProfileSectionProps) {
  const { can, shop: sessionShop } = useAuth();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? sessionShop;

  let body: ReactNode;
  if (shop) {
    body = can("settings") ? <ProfileForm shop={shop} /> : <ProfileReadOnly shop={shop} />;
  } else if (shopQuery.isError) {
    body = (
      <Card title="Shop profile">
        <ErrorState
          compact
          error={shopQuery.error}
          onRetry={() => void shopQuery.refetch()}
          retrying={shopQuery.isFetching}
        />
      </Card>
    );
  } else {
    body = (
      <Card title="Shop profile">
        <div className={styles.skeleton} aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={64} />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <div id={id} tabIndex={-1} className={styles.anchor}>
      {body}
    </div>
  );
}

function ProfileReadOnly({ shop }: { shop: Shop }) {
  return (
    <Card title="Shop profile" description="How your shop appears on receipts and WhatsApp messages.">
      <DescriptionList
        items={[
          { key: "name", label: "Shop name", value: shop.name },
          { key: "owner", label: "Owner", value: shop.owner_name },
          { key: "phone", label: "Phone", value: formatPhone(shop.phone) || "—" },
          { key: "email", label: "Email", value: shop.email || "—" },
          { key: "address", label: "Address", value: shop.address || "—" },
          { key: "city", label: "City", value: shop.city || "—" },
          { key: "segment", label: "Shop type", value: shop.segment || "—" },
          { key: "upi", label: "UPI ID", value: shop.upi_id ? <span className="mono">{shop.upi_id}</span> : "—" },
          { key: "plan", label: "Plan", value: <Badge tone="pen">{PLAN_LABEL[shop.plan]}</Badge> },
        ]}
      />
      <p className={styles.readOnlyNote}>Only the owner, or someone with Settings access, can change these.</p>
    </Card>
  );
}

function ProfileForm({ shop }: { shop: Shop }) {
  const update = useUpdateShop();
  const toast = useToast();
  const [base, setBase] = useState(shop);
  const [draft, setDraft] = useState(() => draftFrom(shop));
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const pending = changes(draft, base);
  const dirty = Object.keys(pending).length > 0;

  // Fresh shop data (another device, a refetch) replaces the form only while nothing is edited.
  if (shop !== base && !dirty) {
    setBase(shop);
    setDraft(draftFrom(shop));
  }

  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    const field: ProfileField = key === "segmentChoice" || key === "segmentOther" ? "segment" : (key as ProfileField);
    if (errors[field]) setErrors((previous) => ({ ...previous, [field]: undefined }));
    setFormError(null);
  };

  const discard = () => {
    setDraft(draftFrom(base));
    setErrors({});
    setFormError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) {
      const first = Object.keys(found)[0];
      document.getElementById(`shop-${first}`)?.focus();
      return;
    }
    if (!dirty) return;
    update.mutate(pending, {
      onSuccess: (saved) => {
        // The API tidies values (e.g. the phone format); show what was saved.
        setBase(saved);
        setDraft(draftFrom(saved));
        toast.success("Changes saved", { description: "Receipts and messages use the new details." });
      },
      onError: (error) => {
        const message = errorMessage(error);
        const fieldErrors = isApiError(error) ? error.fieldErrors : undefined;
        const fromApi: ProfileErrors = {};
        for (const [path, text] of Object.entries(fieldErrors ?? {})) {
          if (path in draft || path === "segment") fromApi[path as ProfileField] = text;
        }
        const field = fieldForMessage(message);
        if (Object.keys(fromApi).length > 0) setErrors(fromApi);
        else if (field) setErrors({ [field]: message });
        else setFormError(message);
      },
    });
  };

  const upiValid = UPI_PATTERN.test(draft.upi_id.trim());

  return (
    <Card
      title="Shop profile"
      description="How your shop appears on receipts and WhatsApp messages."
      footer={
        <div className={styles.footer}>
          {formError ? (
            <p className={styles.formError} role="alert">
              <CircleAlert aria-hidden="true" />
              <span>{formError}</span>
            </p>
          ) : (
            <p className={styles.footerNote}>{dirty ? "You have unsaved changes." : "All changes saved."}</p>
          )}
          {dirty && (
            <Button variant="ghost" onClick={discard} disabled={update.isPending}>
              Discard
            </Button>
          )}
          <Button type="submit" form={FORM_ID} variant="primary" loading={update.isPending} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={handleSubmit} className={styles.formGrid} aria-label="Shop profile">
        <Field label="Shop name" id="shop-name" error={errors.name}>
          <Input value={draft.name} onChange={(event) => set("name", event.target.value)} maxLength={160} autoComplete="organization" />
        </Field>
        <Field label="Owner name" id="shop-owner_name" error={errors.owner_name}>
          <Input value={draft.owner_name} onChange={(event) => set("owner_name", event.target.value)} maxLength={160} autoComplete="name" />
        </Field>
        <Field label="Phone" id="shop-phone" error={errors.phone} hint="Printed on receipts and messages.">
          <Input
            type="tel"
            inputMode="tel"
            value={draft.phone}
            onChange={(event) => set("phone", event.target.value)}
            maxLength={20}
            autoComplete="tel"
          />
        </Field>
        <Field label="Email" id="shop-email" optional error={errors.email}>
          <Input
            type="email"
            inputMode="email"
            value={draft.email}
            onChange={(event) => set("email", event.target.value)}
            maxLength={160}
            autoComplete="email"
          />
        </Field>
        <Field label="Address" id="shop-address" optional error={errors.address} className={styles.full}>
          <Textarea
            rows={2}
            value={draft.address}
            onChange={(event) => set("address", event.target.value)}
            maxLength={500}
            autoComplete="street-address"
          />
        </Field>
        <Field label="City" id="shop-city" optional error={errors.city}>
          <Input value={draft.city} onChange={(event) => set("city", event.target.value)} maxLength={160} autoComplete="address-level2" />
        </Field>
        <div className={styles.segmentPair}>
          <Field label="Shop type" id="shop-segment" error={errors.segment}>
            <Select
              value={draft.segmentChoice}
              options={SEGMENTS.map((segment) => ({ value: segment, label: segment }))}
              onValueChange={(value) => set("segmentChoice", value)}
            />
          </Field>
          {draft.segmentChoice === OTHER_SEGMENT && (
            <Field label="What kind of shop?" labelHidden optional>
              <Input
                value={draft.segmentOther}
                onChange={(event) => set("segmentOther", event.target.value)}
                maxLength={160}
                placeholder="For example: Sweets, Paan, Hardware and paints"
              />
            </Field>
          )}
        </div>
        <div className={`${styles.full} ${styles.upiRow}`}>
          <Field
            label="UPI ID"
            id="shop-upi_id"
            optional
            error={errors.upi_id}
            hint="Shown as a QR code on receipts so customers can pay dues."
          >
            <Input
              className="mono"
              value={draft.upi_id}
              onChange={(event) => set("upi_id", event.target.value)}
              maxLength={160}
              placeholder="yourshop@upi"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </Field>
          {upiValid && <UpiQrPreview upiId={draft.upi_id.trim()} payeeName={draft.name} />}
        </div>
        <div className={styles.full}>
          <PlanRow shop={base} />
        </div>
      </form>
    </Card>
  );
}
