import { useId } from "react";
import { BrowserCard } from "./BrowserCard";
import styles from "./GetAppSection.module.css";
import { InstallCard } from "./InstallCard";

/** "Get the app" (landing #get-app and /download): install ShopOS, or use it in the browser. */
export default function GetAppSection() {
  const headingId = useId();
  return (
    <section id="get-app" className={styles.section} aria-labelledby={headingId}>
      <div className={styles.intro}>
        <h2 id={headingId} className={styles.title} data-section-heading>
          Get ShopOS on every device at your shop
        </h2>
        <p className={styles.lede}>
          Install it on your phone and the counter computer, or open it in any browser. Same shop, same data, everywhere.
        </p>
      </div>
      <div className={styles.cards}>
        <InstallCard />
        <BrowserCard />
      </div>
    </section>
  );
}
