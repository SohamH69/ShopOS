// Small pieces shared by the ShopOS admin pages: shop photo, plan and status badges, plan options.

import { useQueryClient } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { useCallback, useState } from "react";
import { Badge, type SelectOption } from "../../components/ui";
import { PLAN_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { queryKeys } from "../../lib/queries";
import type { AdminShopDetail, AdminShopRow, Plan } from "../../lib/types";
import styles from "./adminBits.module.css";

export const PLANS: readonly Plan[] = ["free", "basic", "pro", "business"];

export const PLAN_OPTIONS: readonly SelectOption<Plan>[] = PLANS.map((plan) => ({ value: plan, label: PLAN_LABEL[plan] }));

export function isPlan(value: string | null | undefined): value is Plan {
  return PLANS.includes(value as Plan);
}

/** The shop-front photo, or a quiet placeholder when the owner hasn't added one. */
export function ShopPhoto({
  url,
  size = "sm",
  className,
}: {
  url: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const classes = cx(styles.photo, size === "lg" ? styles.photoLg : styles.photoSm, className);
  if (!url || failed) {
    return (
      <span className={cx(classes, styles.photoEmpty)} aria-hidden="true">
        <Store />
      </span>
    );
  }
  return (
    <img
      className={classes}
      src={url}
      alt=""
      loading={size === "sm" ? "lazy" : undefined}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/** Free in neutral, paid plans in peacock. */
export function PlanBadge({ plan, size = "md" }: { plan: Plan; size?: "sm" | "md" }) {
  return (
    <Badge tone={plan === "free" ? "neutral" : "pen"} size={size}>
      {PLAN_LABEL[plan]}
    </Badge>
  );
}

type StatusFields = Pick<AdminShopRow, "is_suspended" | "setup_complete" | "is_demo">;

/** Suspended (danger), Setup incomplete (warn), Demo (neutral). Nothing when the shop is simply live. */
export function ShopStatusBadges({
  shop,
  size = "md",
  showLive = false,
  className,
}: {
  shop: StatusFields;
  size?: "sm" | "md";
  /** Show a quiet "Live" mark when no other status applies. */
  showLive?: boolean;
  className?: string;
}) {
  const badges = [];
  if (shop.is_suspended) {
    badges.push(
      <Badge key="suspended" tone="margin" size={size}>
        Suspended
      </Badge>,
    );
  }
  if (!shop.setup_complete) {
    badges.push(
      <Badge key="setup" tone="haldi" size={size} title="No shop photo, map pin or address yet">
        Setup incomplete
      </Badge>,
    );
  }
  if (shop.is_demo) {
    badges.push(
      <Badge key="demo" tone="neutral" size={size}>
        Demo
      </Badge>,
    );
  }
  if (badges.length === 0) {
    if (!showLive) return null;
    return (
      <span className={cx(styles.live, className)}>
        <span className={styles.liveDot} aria-hidden="true" />
        Live
      </span>
    );
  }
  return <span className={cx(styles.badges, className)}>{badges}</span>;
}

/** After an admin action: show the server's copy of the shop now, refresh lists and numbers. */
export function useApplyShopUpdate() {
  const queryClient = useQueryClient();
  return useCallback(
    (shop: AdminShopDetail) => {
      queryClient.setQueryData(queryKeys.adminShop(shop.id), shop);
      void queryClient.invalidateQueries({ queryKey: ["admin", "shops"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminStats });
    },
    [queryClient],
  );
}

/** "basic → pro" from the audit log, with plan names. */
export function describePlanChange(detail: string): string {
  const parts = detail.split("→").map((part) => part.trim());
  if (parts.length === 2 && isPlan(parts[0]) && isPlan(parts[1])) {
    return `${PLAN_LABEL[parts[0]]} → ${PLAN_LABEL[parts[1]]}`;
  }
  return detail;
}
