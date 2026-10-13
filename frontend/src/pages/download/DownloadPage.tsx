import { ArrowLeft, AppWindow, House, WifiOff, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import GetAppSection from "../../features/get-app/GetAppSection";
import { cx } from "../../lib/cx";
import { useDocumentTitle } from "../../lib/hooks";
import layout from "../landing/Landing.module.css";
import { SiteHeader } from "../landing/SiteHeader";
import styles from "./DownloadPage.module.css";

const APP_BENEFITS = [
  {
    key: "home",
    icon: House,
    title: "Opens from your home screen",
    line: "Tap the ShopOS icon like any other app. No typing addresses, no searching for tabs.",
  },
  {
    key: "window",
    icon: AppWindow,
    title: "Full screen, with no browser bar",
    line: "More room for orders, and nothing at the top to tap by mistake.",
  },
  {
    key: "shortcuts",
    icon: Zap,
    title: "Shortcuts for New order and Pickups",
    line: "Press and hold the app icon to jump straight to a new order or the pickup list.",
  },
  {
    key: "offline",
    icon: WifiOff,
    title: "Opens even without internet",
    line: "The app itself loads offline. Saving orders and payments needs a connection.",
  },
] as const;

export default function DownloadPage() {
  useDocumentTitle("Get the app");

  return (
    <div className={layout.page}>
      <SiteHeader variant="minimal" />
      <main className={styles.main}>
        <header className={cx(styles.header, layout.night)}>
          <span className={layout.awning} aria-hidden="true" />
          <div className={layout.container}>
            <p className={styles.eyebrow}>Download</p>
            <h1 className={styles.title}>
              Get the ShopOS <em>app</em>
            </h1>
          </div>
        </header>

        <div className={styles.getApp}>
          <div className={layout.container}>
            <GetAppSection />
          </div>
        </div>

        <section className={styles.benefits} aria-labelledby="benefits-title">
          <div className={layout.container}>
            <h2 id="benefits-title" className={styles.benefitsTitle}>
              What you get with the app
            </h2>
            <ul className={styles.benefitList}>
              {APP_BENEFITS.map(({ key, icon: Icon, title, line }) => (
                <li key={key} className={styles.benefit}>
                  <span className={styles.benefitIcon} aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className={styles.benefitTitle}>{title}</p>
                    <p className={styles.benefitLine}>{line}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={layout.container}>
          <div className={styles.footerRow}>
            <Link to="/" className={styles.homeLink}>
              <ArrowLeft size={16} aria-hidden="true" />
              <span>ShopOS home</span>
            </Link>
            <p className={styles.copyright}>© 2026 ShopOS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
