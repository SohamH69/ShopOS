import { ArrowLeft, Printer } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button, ButtonLink, ErrorState, Skeleton, Stamp } from "../../../components/ui";
import { QrCode } from "../../../features/get-app/QrCode";
import { useAuth } from "../../../lib/auth";
import { METHOD_LABEL } from "../../../lib/constants";
import { formatDateTime, formatMoneyExact, formatPhone, formatQty, orderNo } from "../../../lib/format";
import { useDocumentTitle } from "../../../lib/hooks";
import { useOrder } from "../../../lib/queries";
import { upiPaymentUri } from "../../../lib/upi";
import styles from "./ReceiptPage.module.css";

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? `${styles.line} ${styles.lineStrong}` : styles.line}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** An 80 mm thermal-style receipt. Print it, or show it on screen for the customer to scan and pay. */
export default function ReceiptPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const { shop } = useAuth();
  const order = useOrder(Number.isFinite(orderId) ? orderId : null);
  useDocumentTitle(order.data ? `Receipt ${orderNo(order.data.number)}` : "Receipt");

  const toolbar = (
    <div className={styles.toolbar}>
      <ButtonLink to={order.data ? `/app/orders?order=${order.data.id}` : "/app/orders"} variant="ghost" icon={<ArrowLeft aria-hidden="true" />}>
        Back to orders
      </ButtonLink>
      <Button variant="primary" icon={<Printer aria-hidden="true" />} disabled={!order.data} onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );

  if (order.isError) {
    return (
      <main className={styles.page}>
        {toolbar}
        <ErrorState error={order.error} onRetry={() => void order.refetch()} />
      </main>
    );
  }

  const data = order.data;
  if (!data || !shop) {
    return (
      <main className={styles.page} aria-busy="true">
        {toolbar}
        <div className={styles.receipt}>
          <Skeleton width="60%" height={22} />
          <Skeleton width="80%" height={12} />
          <Skeleton width="100%" height={120} />
        </div>
      </main>
    );
  }

  const showUpi = data.outstanding > 0 && data.status !== "cancelled" && Boolean(shop.upi_id);
  const upiUri = showUpi && shop.upi_id
    ? upiPaymentUri({ upiId: shop.upi_id, payeeName: shop.name, amount: data.outstanding, note: `Order ${data.number}` })
    : null;

  return (
    <main className={styles.page}>
      {toolbar}
      <article className={styles.receipt} aria-label={`Receipt for order ${orderNo(data.number)}`}>
        <header className={styles.head}>
          <h1 className={styles.shop}>{shop.name}</h1>
          {shop.address && <p>{shop.address}</p>}
          {shop.phone && <p>{formatPhone(shop.phone)}</p>}
        </header>

        <div className={styles.rule} />
        <Line label="Receipt" value={orderNo(data.number)} strong />
        <Line label="Date" value={formatDateTime(data.created_at)} />
        <Line label="Customer" value={data.customer_name ?? "Walk-in"} />
        {data.status === "cancelled" && <p className={styles.cancelled}>This order was cancelled.</p>}

        <div className={styles.rule} />
        <ul className={styles.items}>
          {data.items.map((item) => (
            <li key={item.id}>
              <span className={styles.itemName}>{item.name}</span>
              <span className={styles.itemQty}>
                {formatQty(item.quantity, item.unit)} × {formatMoneyExact(item.unit_price)}
                {item.discount > 0 && ` − ${formatMoneyExact(item.discount)}`}
              </span>
              <span className={styles.itemTotal}>{formatMoneyExact(item.line_total)}</span>
            </li>
          ))}
        </ul>

        <div className={styles.rule} />
        <Line label="Subtotal" value={formatMoneyExact(data.subtotal)} />
        {data.discount > 0 && <Line label="Discount" value={`− ${formatMoneyExact(data.discount)}`} />}
        <Line label="Total" value={formatMoneyExact(data.total)} strong />
        {data.payments.map((payment) => (
          <Line key={payment.id} label={`Paid · ${METHOD_LABEL[payment.method]}`} value={formatMoneyExact(payment.amount)} />
        ))}
        <Line label="Due" value={formatMoneyExact(data.outstanding)} strong={data.outstanding > 0} />

        {data.payment_status === "paid" && data.status !== "cancelled" && (
          <div className={styles.stamp}>
            <Stamp label="Paid" size="md" />
          </div>
        )}

        {upiUri && (
          <div className={styles.upi}>
            <QrCode value={upiUri} label={`UPI QR code to pay ${formatMoneyExact(data.outstanding)}`} className={styles.qr} />
            <p>Scan to pay {formatMoneyExact(data.outstanding)}</p>
            <p className={styles.upiId}>{shop.upi_id}</p>
          </div>
        )}

        <div className={styles.rule} />
        <p className={styles.thanks}>Thank you for shopping with us</p>
      </article>
    </main>
  );
}
