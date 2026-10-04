import { Check } from "lucide-react";
import { ButtonLink } from "../../components/ui";
import { cx } from "../../lib/cx";
import { PLANS } from "./content";
import layout from "./Landing.module.css";
import styles from "./Pricing.module.css";

export function Pricing() {
  return (
    <section id="pricing" className={cx(layout.band, layout.anchor)} aria-labelledby="pricing-title">
      <div className={layout.container}>
        <div className={layout.intro}>
          <p className={layout.eyebrow}>Pricing</p>
          <h2 id="pricing-title" className={layout.title} data-section-heading>
            Start free. Pay as your shop grows.
          </h2>
          <p className={layout.lede}>Four plans, priced for local shops. Move up or down whenever you like.</p>
        </div>

        <ul className={styles.plans}>
          {PLANS.map((plan) => (
            <li key={plan.id} className={cx(styles.plan, plan.featured && styles.featured)}>
              <div className={styles.planHead}>
                <h3 className={styles.planName}>{plan.name}</h3>
                {plan.featured && <span className={styles.flag}>Most shops start here</span>}
              </div>
              <p className={styles.price}>
                {plan.pricePrefix && <span className={styles.pricePrefix}>{plan.pricePrefix} </span>}
                <span className={styles.amount}>{plan.price}</span>
                {plan.period && <span className={styles.period}>{plan.period}</span>}
              </p>
              <p className={styles.summary}>{plan.summary}</p>
              <div className={styles.features}>
                {plan.includes && <p className={styles.includes}>{plan.includes}</p>}
                <ul className={styles.featureList}>
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <Check size={16} aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <ButtonLink to="/signup" variant={plan.featured ? "primary" : "secondary"} block className={styles.cta}>
                {plan.cta}
              </ButtonLink>
            </li>
          ))}
        </ul>

        <p className={styles.smallPrint}>Prices in INR, billed monthly. Cancel anytime.</p>
      </div>
    </section>
  );
}
