import { Plus } from "lucide-react";
import { cx } from "../../lib/cx";
import { FAQS } from "./content";
import styles from "./Faq.module.css";
import layout from "./Landing.module.css";

export function Faq() {
  return (
    <section className={cx(layout.band, layout.desk, layout.anchor)} id="faq" aria-labelledby="faq-title">
      <div className={cx(layout.container, styles.grid)}>
        <div className={styles.aside}>
          <p className={layout.eyebrow}>Questions</p>
          <h2 id="faq-title" className={layout.title}>
            Questions shopkeepers ask
          </h2>
        </div>
        <div className={styles.list}>
          {FAQS.map((faq) => (
            <details key={faq.question} className={styles.item}>
              <summary className={styles.question}>
                <span>{faq.question}</span>
                <Plus className={styles.icon} size={18} aria-hidden="true" />
              </summary>
              <p className={styles.answer}>{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
