import { CircleAlert, ShieldCheck, ShieldOff } from "lucide-react";
import { useRef, useState, type FormEvent, type Ref } from "react";
import { Button, Card, ConfirmDialog, Field, Modal, Select, Textarea, useToast } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { PLAN_LABEL } from "../../lib/constants";
import { formatDateTime, formatRelative } from "../../lib/format";
import { useChangeShopPlan, useReactivateShop, useSuspendShop } from "../../lib/queries";
import type { AdminShopDetail, Plan } from "../../lib/types";
import { PLAN_OPTIONS, useApplyShopUpdate } from "./adminBits";
import styles from "./AdminShopPage.module.css";

function InlineError({ error }: { error: unknown }) {
  return (
    <p className={styles.inlineError} role="alert">
      <CircleAlert aria-hidden="true" />
      <span>{errorMessage(error)}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/** Move the shop to another plan. Saved straight away and written to the history. */
export function PlanCard({ shop, className }: { shop: AdminShopDetail; className?: string }) {
  const toast = useToast();
  const apply = useApplyShopUpdate();
  const change = useChangeShopPlan();
  const [plan, setPlan] = useState<Plan>(shop.plan);
  // When the server's plan changes (a save here, or a refetch), start from it again.
  const [syncedPlan, setSyncedPlan] = useState<Plan>(shop.plan);
  if (shop.plan !== syncedPlan) {
    setSyncedPlan(shop.plan);
    setPlan(shop.plan);
  }
  const changed = plan !== shop.plan;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!changed || change.isPending) return;
    change.mutate(
      { id: shop.id, plan },
      {
        onSuccess: (updated) => {
          apply(updated);
          toast.success(`Plan changed to ${PLAN_LABEL[updated.plan]}`, { description: updated.name });
        },
      },
    );
  };

  return (
    <Card title="Plan" description="Which plan this shop is on. Changes show in the history." className={className}>
      <form className={styles.planForm} onSubmit={handleSubmit} noValidate>
        <Field label="Plan" labelHidden>
          <Select<Plan>
            options={PLAN_OPTIONS}
            value={plan}
            onValueChange={(next) => {
              change.reset();
              setPlan(next);
            }}
            disabled={change.isPending}
          />
        </Field>
        <Button type="submit" variant="primary" disabled={!changed} loading={change.isPending}>
          Save
        </Button>
      </form>
      {change.isError && <InlineError error={change.error} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Access: suspend / reactivate
// ---------------------------------------------------------------------------

export interface AccessCardProps {
  shop: AdminShopDetail;
  onSuspend: () => void;
  onReactivate: () => void;
  /** The card's main button (Suspend or Reactivate), so focus can land on it after a dialog. */
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
}

/** Whether the shop can be used, and the switch to change that. */
export function AccessCard({ shop, onSuspend, onReactivate, buttonRef, className }: AccessCardProps) {
  return (
    <Card title="Access" className={className}>
      <div className={styles.access}>
        {shop.is_suspended ? (
          <>
            <p className={styles.accessState}>
              <ShieldOff aria-hidden="true" className={styles.accessIconOff} />
              <span>
                <strong>Suspended</strong>
                {shop.suspended_at && (
                  <span className={styles.accessWhen} title={formatDateTime(shop.suspended_at)}>
                    {" "}
                    {formatRelative(shop.suspended_at)}
                  </span>
                )}
              </span>
            </p>
            <p className={styles.accessText}>
              No one at this shop can sign in, and its customers' khata links are off. Nothing has been deleted.
            </p>
            <Button ref={buttonRef} variant="primary" block icon={<ShieldCheck aria-hidden="true" />} onClick={onReactivate}>
              Reactivate shop
            </Button>
          </>
        ) : (
          <>
            <p className={styles.accessState}>
              <ShieldCheck aria-hidden="true" className={styles.accessIconOn} />
              <strong>Open</strong>
            </p>
            <p className={styles.accessText}>
              Suspending signs out everyone at this shop, blocks their sign-in and turns off their customers' khata
              links. You can reactivate it any time.
            </p>
            <Button
              ref={buttonRef}
              block
              className={styles.suspendButton}
              icon={<ShieldOff aria-hidden="true" />}
              onClick={onSuspend}
              disabled={shop.is_demo}
              aria-describedby={shop.is_demo ? "demo-suspend-note" : undefined}
            >
              Suspend shop
            </Button>
            {shop.is_demo && (
              <p id="demo-suspend-note" className={styles.demoNote}>
                The demo shop can't be suspended: “Try the demo shop” on the website signs people in to it.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

/** Suspend with a required reason. The server's message (e.g. for the demo shop) shows in the dialog. */
export interface ShopDialogProps {
  shop: AdminShopDetail;
  open: boolean;
  onClose: () => void;
  /** After the server agreed (instead of onClose). */
  onDone: (updated: AdminShopDetail) => void;
}

export function SuspendModal({ shop, open, onClose, onDone }: ShopDialogProps) {
  const toast = useToast();
  const apply = useApplyShopUpdate();
  const suspend = useSuspendShop();
  const [reason, setReason] = useState("");
  const [attempted, setAttempted] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const reasonError = attempted && !reason.trim() ? "Write why this shop is being suspended." : undefined;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (suspend.isPending) return;
    setAttempted(true);
    if (!reason.trim()) {
      reasonRef.current?.focus();
      return;
    }
    suspend.mutate(
      { id: shop.id, reason: reason.trim() },
      {
        onSuccess: (updated) => {
          apply(updated);
          toast.success(`${updated.name} suspended`, {
            description: "Its people are signed out and its khata links are off.",
          });
          onDone(updated);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={suspend.isPending ? () => undefined : onClose}
      title={`Suspend ${shop.name}?`}
      description="Everyone at this shop is signed out and can't sign in again, and their customers' khata links stop working. Nothing is deleted."
      initialFocusRef={reasonRef}
      onSubmit={handleSubmit}
      footer={
        <>
          <Button onClick={onClose} disabled={suspend.isPending}>
            Keep it open
          </Button>
          <Button type="submit" variant="danger" loading={suspend.isPending}>
            Suspend shop
          </Button>
        </>
      }
    >
      <div className={styles.modalBody}>
        <Field label="Reason" required hint="The team sees this in the shop's history." error={reasonError}>
          <Textarea
            ref={reasonRef}
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => {
              suspend.reset();
              setReason(event.target.value);
            }}
            placeholder="For example: payment dispute, reported for fraud"
          />
        </Field>
        {suspend.isError && <InlineError error={suspend.error} />}
      </div>
    </Modal>
  );
}

/** Reactivate: one confirmation, then everything works again. */
export function ReactivateDialog({ shop, open, onClose, onDone }: ShopDialogProps) {
  const toast = useToast();
  const apply = useApplyShopUpdate();
  const reactivate = useReactivateShop();
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      tone="primary"
      title={`Reactivate ${shop.name}?`}
      description="People at this shop can sign in again, and their customers' khata links work again."
      confirmLabel="Reactivate shop"
      cancelLabel="Keep suspended"
      loading={reactivate.isPending}
      error={reactivate.isError ? errorMessage(reactivate.error) : undefined}
      onConfirm={() =>
        reactivate.mutate(shop.id, {
          onSuccess: (updated) => {
            apply(updated);
            toast.success(`${updated.name} reactivated`, { description: "Its people can sign in again." });
            onDone(updated);
          },
        })
      }
    />
  );
}
