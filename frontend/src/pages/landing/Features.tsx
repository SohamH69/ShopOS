import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  ChartColumn,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  IndianRupee,
  MessageCircle,
  Package,
  PackageCheck,
  ReceiptIndianRupee,
  Truck,
  UserCog,
} from "lucide-react";
import type { CSSProperties } from "react";
import { SEVERITY_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { formatMoney } from "../../lib/format";
import { ATTENTION_EXAMPLE, MODULES, ORDER_EFFECTS, type OrderEffect } from "./content";
import styles from "./Features.module.css";
import layout from "./Landing.module.css";
import { useInView } from "./useInView";

/** "Open ShopOS and it tells you what to handle first", with a static Today queue. */
export function NeedsAttention() {
  return (
    <section id="features" className={cx(layout.band, layout.anchor)} aria-labelledby="features-title">
      <div className={cx(layout.container, styles.attentionGrid)}>
        <div className={styles.attentionCopy}>
          <p className={layout.eyebrow}>Features</p>
          <h2 id="features-title" className={layout.title} data-section-heading>
            Open ShopOS and it tells you what to handle first.
          </h2>
          <p className={layout.lede}>
            The Today screen gathers everything waiting on you: pickups, dues, low stock, deliveries and supplier
            payments, with the most urgent at the top. Tap a row and you're there.
          </p>
        </div>

        <div className={styles.panel} role="group" aria-labelledby="attention-example-title">
          <div className={styles.panelHead}>
            <p id="attention-example-title" className={styles.panelTitle}>
              Needs attention
            </p>
            <p className={styles.panelHint}>Most urgent first</p>
          </div>
          <ul className={styles.rows}>
            {ATTENTION_EXAMPLE.map((item) => (
              <li key={item.key} className={styles.row}>
                <span className={cx(styles.severity, styles[item.severity])} aria-hidden="true" />
                <span className="visually-hidden">{SEVERITY_LABEL[item.severity]}: </span>
                <span className={styles.rowText}>
                  <span className={styles.rowMain}>
                    <span className={styles.value}>{item.value}</span> <span className={styles.label}>{item.label}</span>
                  </span>
                  {item.detail && <span className={styles.detail}>{item.detail}</span>}
                </span>
                <ChevronRight className={styles.chevron} size={18} aria-hidden="true" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const EFFECT_ICONS: Record<OrderEffect["key"], LucideIcon> = {
  pickups: PackageCheck,
  payments: IndianRupee,
  khata: BookOpenText,
  stock: Package,
  reports: ChartColumn,
};

/** The same icons the app's own navigation uses, so the site and the app read as one thing. */
const MODULE_ICONS: Record<string, LucideIcon> = {
  Orders: ClipboardList,
  "Pending pickups": PackageCheck,
  Khata: BookOpenText,
  Payments: IndianRupee,
  Inventory: Package,
  Suppliers: Truck,
  Expenses: ReceiptIndianRupee,
  Reports: ChartColumn,
  "Staff roles": UserCog,
  "WhatsApp messages": MessageCircle,
};

/** The hero's order #1045 being marked collected, and every book it updates on its own. */
function OrderFlow() {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.35 });

  return (
    <div ref={ref} className={styles.flow} data-in-view={inView || undefined} role="group" aria-labelledby="flow-title">
      <div className={styles.orderCard}>
        <p id="flow-title" className={styles.orderHead}>
          <span className={styles.orderNo}>#1045</span> · Rahul Sharma
        </p>
        <ul className={styles.orderItems}>
          <li>
            <span>5 kg Basmati rice</span>
            <span className="mono">{formatMoney(460)}</span>
          </li>
          <li>
            <span>1 Tea powder 500g</span>
            <span className="mono">{formatMoney(198)}</span>
          </li>
        </ul>
        <p className={styles.orderTotal}>
          <span>Total</span>
          <span className="mono">{formatMoney(658)}</span>
        </p>
        <p className={styles.orderAction}>
          <CircleCheck size={18} aria-hidden="true" />
          Marked collected
        </p>
      </div>

      <ul className={styles.effects} aria-label="What that one tap updates">
        {ORDER_EFFECTS.map((effect, index) => {
          const Icon = EFFECT_ICONS[effect.key];
          return (
            <li key={effect.key} style={{ "--i": index } as CSSProperties}>
              <div className={styles.effect}>
                <span className={styles.effectIcon} aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span className={styles.effectText}>
                  <span className={styles.effectBook}>{effect.book}</span>
                  <span className={styles.effectDetail}>{effect.detail}</span>
                </span>
                <span className={cx(styles.effectChange, effect.tone && styles[effect.tone])}>{effect.change}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One order flowing into every book, then the modules, one specific line each. */
export function WhatsInside() {
  return (
    <section className={cx(layout.band, styles.insideBand)} aria-labelledby="inside-title">
      <div className={layout.container}>
        <div className={layout.intro}>
          <p className={layout.eyebrow}>What's inside</p>
          <h2 id="inside-title" className={layout.title}>
            Everything your shop runs on, connected.
          </h2>
          <p className={layout.lede}>
            One order updates the customer's khata, your stock and the day's report on its own. Nothing to copy from one
            book to another.
          </p>
        </div>
        <OrderFlow />
        <dl className={styles.modules}>
          {MODULES.map((module) => {
            const Icon = MODULE_ICONS[module.name];
            return (
              <div key={module.name} className={styles.module}>
                <dt className={styles.moduleName}>
                  <span className={styles.moduleIcon} aria-hidden="true">
                    {Icon && <Icon size={18} />}
                  </span>
                  {module.name}
                </dt>
                <dd className={styles.moduleLine}>{module.line}</dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
