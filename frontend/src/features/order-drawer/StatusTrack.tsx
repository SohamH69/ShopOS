import { Check } from "lucide-react";
import { isCompletedStatus, ORDER_STATUS_LABEL, statusStepsFor } from "../../lib/constants";
import type { Fulfillment, OrderStatus } from "../../lib/types";
import styles from "./OrderDrawer.module.css";

export interface StatusTrackProps {
  status: OrderStatus;
  fulfillment: Fulfillment;
}

/** New → Preparing → Ready → Collected (or Delivered), with the current step marked. */
export function StatusTrack({ status, fulfillment }: StatusTrackProps) {
  const steps = statusStepsFor(fulfillment);
  const currentIndex = steps.indexOf(status);
  const finished = isCompletedStatus(status);

  return (
    <ol className={styles.track} aria-label="Order status">
      {steps.map((step, index) => {
        const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
        const checked = state === "done" || (state === "current" && finished);
        return (
          <li
            key={step}
            className={styles.step}
            data-state={state}
            data-status={step}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className={styles.marker} aria-hidden="true">
              {checked ? <Check style={{ strokeWidth: 3 }} /> : state === "current" ? <span className={styles.markerDot} /> : null}
            </span>
            <span className={styles.stepLabel}>{ORDER_STATUS_LABEL[step]}</span>
            {state !== "todo" && <span className="visually-hidden">{state === "done" ? ", done" : ", current step"}</span>}
          </li>
        );
      })}
    </ol>
  );
}
