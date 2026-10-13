import type { CSSProperties } from "react";
import { cx } from "../../lib/cx";
import { PAPER_STEPS, SHOPOS_STEPS } from "./content";
import styles from "./HowItWorks.module.css";
import layout from "./Landing.module.css";
import { useInView } from "./useInView";

/**
 * The notebook way beside the ShopOS way. The paper side is a ruled notebook page with a red
 * margin; when it scrolls into view, a pen strikes out its nine steps one after another.
 */
export function HowItWorks() {
  const [pageRef, struck] = useInView<HTMLDivElement>({ threshold: 0.45 });

  return (
    <section id="how-it-works" className={cx(layout.band, layout.desk, layout.anchor)} aria-labelledby="how-title">
      <div className={layout.container}>
        <div className={layout.intro}>
          <p className={layout.eyebrow}>How it works</p>
          <h2 id="how-title" className={layout.title} data-section-heading>
            Nine steps on paper. Three in ShopOS.
          </h2>
          <p className={layout.lede}>
            A customer says “keep it ready, I’ll collect it later”. Here is what happens next, with a notebook and
            with ShopOS.
          </p>
        </div>

        <div className={styles.compare}>
          <div ref={pageRef} className={styles.notebook} data-struck={struck || undefined}>
            <div className={styles.pageHead}>
              <h3 className={styles.sideTitle}>Today, on paper</h3>
              <p className={styles.count}>{PAPER_STEPS.length} steps</p>
            </div>
            <ol className={styles.paperList}>
              {PAPER_STEPS.map((step, index) => (
                <li key={step} style={{ "--i": index } as CSSProperties}>
                  <span className={styles.paperIndex}>{index + 1}</span>
                  <s className={styles.paperText}>{step}</s>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.shoposSide}>
            <div className={styles.pageHead}>
              <h3 className={styles.sideTitle}>With ShopOS</h3>
              <p className={cx(styles.count, styles.countPen)}>{SHOPOS_STEPS.length} steps</p>
            </div>
            <ol className={styles.shoposList}>
              {SHOPOS_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.node} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <p className={styles.stepTitle}>{step.title}</p>
                    <p className={styles.stepLine}>{step.line}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
