import { CalendarClock, Copy, IndianRupee } from "lucide-react";
import { useId } from "react";
import { Avatar, Button, ButtonLink, Money, Skeleton, Stamp } from "../../components/ui";
import { QrCode } from "../../features/get-app/QrCode";
import { formatDate, formatMoney, formatPhone } from "../../lib/format";
import { useCopyToClipboard, useMediaQuery } from "../../lib/hooks";
import { toPaise } from "../../lib/money";
import type { PortalCustomer, PortalShop } from "../../lib/types";
import { upiPaymentUri } from "../../lib/upi";
import styles from "./BalanceCard.module.css";

function promiseText(customer: PortalCustomer): string | null {
  if (!customer.promise_date) return null;
  const date = formatDate(customer.promise_date);
  return customer.promise_amount && customer.promise_amount > 0
    ? `You promised to pay ${formatMoney(customer.promise_amount)} by ${date}.`
    : `You promised to pay by ${date}.`;
}

export interface BalanceCardProps {
  shop: PortalShop;
  customer: PortalCustomer;
  /** Anything on the khata yet (the Settled stamp only goes on a khata that has been paid off). */
  hasHistory: boolean;
}

/** What the customer owes the shop, any promise they made, and Pay by UPI. */
export function BalanceCard({ shop, customer, hasHistory }: BalanceCardProps) {
  const headingId = useId();
  const wide = useMediaQuery("(min-width: 640px)");
  const { copy, copied } = useCopyToClipboard();
  const paise = toPaise(customer.outstanding);
  const hasDues = paise > 0;
  const upiId = shop.upi_id?.trim() || null;
  const note = `${customer.name} khata`.slice(0, 50);
  const payUri = hasDues && upiId ? upiPaymentUri({ upiId, payeeName: shop.name, amount: customer.outstanding, note }) : null;
  const anyAmountUri = upiId ? upiPaymentUri({ upiId, payeeName: shop.name, note }) : null;
  const promise = hasDues ? promiseText(customer) : null;

  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.who}>
        <Avatar name={customer.name} />
        <div className={styles.whoText}>
          <p className={styles.customer}>{customer.name}</p>
          {customer.phone && <p className={styles.phone}>{formatPhone(customer.phone)}</p>}
        </div>
      </div>

      {hasDues ? (
        <div className={styles.dues}>
          <div className={styles.duesMain}>
            <h2 id={headingId} className={styles.label}>
              You owe
            </h2>
            <Money value={customer.outstanding} display tone="margin" className={styles.amount} />
            {promise && (
              <p className={styles.promise}>
                <CalendarClock aria-hidden="true" />
                <span>{promise}</span>
              </p>
            )}

            {payUri ? (
              <>
                <ButtonLink
                  href={payUri}
                  variant="primary"
                  size="lg"
                  block
                  className={styles.pay}
                  icon={<IndianRupee aria-hidden="true" />}
                >
                  Pay {formatMoney(customer.outstanding)} by UPI
                </ButtonLink>
                <p className={styles.note}>
                  Opens your UPI app with the amount filled in. The shop marks it paid once the money reaches them.
                </p>
                <div className={styles.upiRow}>
                  <span>
                    UPI ID <span className={styles.upiId}>{upiId}</span>
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={styles.copy}
                    icon={<Copy aria-hidden="true" />}
                    onClick={() => upiId && void copy(upiId)}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  {anyAmountUri && (
                    <a className={styles.otherAmount} href={anyAmountUri}>
                      Pay a different amount
                    </a>
                  )}
                  <span role="status" className="visually-hidden">
                    {copied ? "UPI ID copied" : ""}
                  </span>
                </div>
              </>
            ) : (
              <p className={styles.note}>Pay at the shop. Your khata here updates once the shop records it.</p>
            )}
          </div>

          {wide && payUri && (
            <figure className={styles.qr}>
              <QrCode value={payUri} label={`UPI QR code to pay ${formatMoney(customer.outstanding)} to ${shop.name}`} />
              <figcaption>Scan with any UPI app</figcaption>
            </figure>
          )}
        </div>
      ) : (
        <div className={styles.settled}>
          <h2 id={headingId} className={styles.label}>
            Your balance
          </h2>
          <div className={styles.settledRow}>
            <p className={styles.settledTitle}>All settled</p>
            {hasHistory && <Stamp label="Settled" className={styles.stamp} />}
          </div>
          <p className={styles.settledNote}>
            {paise < 0
              ? `You have ${formatMoney(-customer.outstanding)} extra with ${shop.name}. It goes towards your next purchase.`
              : hasHistory
                ? `Nothing to pay at ${shop.name}. Thank you!`
                : `Nothing on your khata at ${shop.name} yet.`}
          </p>
        </div>
      )}
    </section>
  );
}

export function BalanceCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.who}>
        <Skeleton width={32} height={32} radius="50%" />
        <Skeleton width={140} height={14} />
      </div>
      <div className={styles.skeletonBody}>
        <Skeleton width={64} height={12} />
        <Skeleton width={170} height={42} radius={10} />
        <Skeleton width="100%" height={48} radius={10} />
      </div>
    </div>
  );
}
