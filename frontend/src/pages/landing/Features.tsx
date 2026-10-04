import { ChevronRight } from "lucide-react";
import { SEVERITY_LABEL } from "../../lib/constants";
import { cx } from "../../lib/cx";
import { ATTENTION_EXAMPLE, MODULES } from "./content";
import styles from "./Features.module.css";
import layout from "./Landing.module.css";

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
            The Today screen gathers everything waiting on you — pickups, dues, low stock, deliveries and supplier
            payments — with the most urgent at the top. Tap a row and you're there.
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

/** A calm two-column list of the modules, one specific line each. */
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
        <dl className={styles.modules}>
          {MODULES.map((module) => (
            <div key={module.name} className={styles.module}>
              <dt className={styles.moduleName}>{module.name}</dt>
              <dd className={styles.moduleLine}>{module.line}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
