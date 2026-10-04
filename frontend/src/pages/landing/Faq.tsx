import { Plus } from "lucide-react";
import { Button } from "../../components/ui";
import { useDemoLogin } from "../../features/get-app/useDemoLogin";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import { FAQS } from "./content";
import styles from "./Faq.module.css";
import layout from "./Landing.module.css";

export function Faq() {
  const { status } = useAuth();
  const { openDemo, pending } = useDemoLogin();

  return (
    <section className={cx(layout.band, layout.anchor)} id="faq" aria-labelledby="faq-title">
      <div className={cx(layout.container, styles.grid)}>
        <div className={styles.aside}>
          <p className={layout.eyebrow}>Questions</p>
          <h2 id="faq-title" className={layout.title}>
            Questions shopkeepers ask
          </h2>
          {status !== "signedIn" && (
            <div className={styles.try}>
              <p className={styles.tryText}>The quickest answer is to look around. The demo shop is full of orders, dues and stock — no sign-up needed.</p>
              <Button onClick={openDemo} loading={pending}>
                Try the demo shop
              </Button>
            </div>
          )}
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
