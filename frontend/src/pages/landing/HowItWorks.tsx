import { cx } from "../../lib/cx";
import { PAPER_STEPS, SHOPOS_STEPS } from "./content";
import styles from "./HowItWorks.module.css";
import layout from "./Landing.module.css";

/** The notebook way (struck through) beside the three ShopOS steps. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className={cx(layout.band, layout.desk, layout.anchor)} aria-labelledby="how-title">
      <div className={layout.container}>
        <div className={layout.intro}>
          <p className={layout.eyebrow}>How it works</p>
          <h2 id="how-title" className={layout.title} data-section-heading>
            Nine steps on paper. Three in ShopOS.
          </h2>
          <p className={layout.lede}>
            A customer says “keep it ready, I’ll collect it later”. Here is what happens next — with a notebook, and
            with ShopOS.
          </p>
        </div>

        <div className={styles.compare}>
          <div className={styles.paperSide}>
            <h3 className={styles.sideTitle}>Today, on paper</h3>
            <ol className={styles.paperList}>
              {PAPER_STEPS.map((step, index) => (
                <li key={step}>
                  <span className={styles.paperIndex}>{index + 1}</span>
                  <s>{step}</s>
                </li>
              ))}
            </ol>
          </div>

          <div className={styles.shoposSide}>
            <h3 className={styles.sideTitle}>With ShopOS</h3>
            <ol className={styles.shoposList}>
              {SHOPOS_STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className={styles.shoposIndex}>{index + 1}</span>
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
