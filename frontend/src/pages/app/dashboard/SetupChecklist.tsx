import { Check, X } from "lucide-react";
import { useState } from "react";
import { Button, ButtonLink, Card, IconButton } from "../../../components/ui";
import { useNewOrder } from "../../../features/new-order/NewOrderProvider";
import { useAuth } from "../../../lib/auth";
import { cx } from "../../../lib/cx";
import type { Permission, SetupProgress } from "../../../lib/types";
import styles from "./SetupChecklist.module.css";

interface SetupStep {
  key: keyof SetupProgress;
  title: string;
  description: string;
  action: string;
  permission: Permission;
  /** Page for the step; without one the step opens the new order sheet. */
  to?: string;
}

const STEPS: readonly SetupStep[] = [
  {
    key: "has_products",
    title: "Add your products",
    description: "Prices and stock, so every order fills in by itself.",
    action: "Add products",
    permission: "inventory",
    to: "/app/products",
  },
  {
    key: "has_customers",
    title: "Add your customers",
    description: "Names, phone numbers and any dues from your notebook.",
    action: "Add customers",
    permission: "customers",
    to: "/app/customers",
  },
  {
    key: "has_orders",
    title: "Create your first order",
    description: "Walk-in, phone or WhatsApp. It takes a few seconds.",
    action: "New order",
    permission: "orders",
  },
  {
    key: "has_staff",
    title: "Invite your staff",
    description: "Each person gets their own login and role.",
    action: "Add staff",
    permission: "staff",
    to: "/app/staff",
  },
];

// Hiding is a per-device convenience (a one-person shop never "invites staff").
const HIDDEN_KEY_PREFIX = "shopos.setupHidden.";

function readHidden(shopId: number | undefined): boolean {
  if (shopId === undefined) return false;
  try {
    return window.localStorage.getItem(`${HIDDEN_KEY_PREFIX}${shopId}`) === "1";
  } catch {
    return false;
  }
}

function writeHidden(shopId: number | undefined): void {
  if (shopId === undefined) return;
  try {
    window.localStorage.setItem(`${HIDDEN_KEY_PREFIX}${shopId}`, "1");
  } catch {
    // Storage blocked: the checklist simply stays hidden until the page reloads.
  }
}

export interface SetupChecklistProps {
  setup: SetupProgress;
  shopId: number | undefined;
}

/** "Set up your shop": shown to new shops until every step is done (or it is hidden). */
export function SetupChecklist({ setup, shopId }: SetupChecklistProps) {
  const { can } = useAuth();
  const { openNewOrder } = useNewOrder();
  const [hidden, setHidden] = useState(() => readHidden(shopId));

  const done = STEPS.filter((step) => setup[step.key]).length;
  if (hidden || done === STEPS.length) return null;

  const hide = () => {
    writeHidden(shopId);
    setHidden(true);
  };

  return (
    <Card
      title="Set up your shop"
      description="A few steps and ShopOS is ready for your counter."
      actions={<IconButton label="Hide setup steps" size="sm" icon={<X aria-hidden="true" />} onClick={hide} />}
    >
      <div className={styles.progress}>
        <span className={styles.progressText}>
          {done} of {STEPS.length} done
        </span>
        <span
          className={styles.track}
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={STEPS.length}
          aria-valuenow={done}
          aria-valuetext={`${done} of ${STEPS.length} steps done`}
        >
          <span className={styles.fill} style={{ width: `${(done / STEPS.length) * 100}%` }} />
        </span>
      </div>

      <div className={styles.stepsWrap}>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => {
            const complete = setup[step.key];
            const allowed = can(step.permission);
            return (
              <li key={step.key} className={cx(styles.step, complete && styles.complete)}>
                <span className={styles.marker} aria-hidden="true">
                  {complete ? <Check /> : index + 1}
                </span>
                <div className={styles.stepText}>
                  <p className={styles.stepTitle}>
                    {step.title}
                    {complete && <span className="visually-hidden"> (done)</span>}
                  </p>
                  <p className={styles.stepDescription}>{step.description}</p>
                </div>
                {!complete && allowed && (
                  <div className={styles.stepAction}>
                    {step.to ? (
                      <ButtonLink to={step.to} size="sm">
                        {step.action}
                      </ButtonLink>
                    ) : (
                      <Button size="sm" onClick={() => openNewOrder()}>
                        {step.action}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </Card>
  );
}
