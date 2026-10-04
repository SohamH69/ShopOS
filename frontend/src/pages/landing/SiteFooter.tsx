import { Link } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { useAuth } from "../../lib/auth";
import layout from "./Landing.module.css";
import { handleSectionLinkClick } from "./scrollToSection";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  const { status } = useAuth();
  const signedIn = status === "signedIn";

  return (
    <footer className={styles.footer}>
      <div className={layout.container}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <Link to="/" className={styles.logo} aria-label="ShopOS home">
              <Logo size={26} />
            </Link>
            <p className={styles.mission}>Making it simple to run a small shop — no technology expertise needed.</p>
          </div>
          <nav aria-label="Footer">
            <ul className={styles.links}>
              <li>
                <a href="#get-app" onClick={(event) => handleSectionLinkClick(event, "get-app")}>
                  Get the app
                </a>
              </li>
              {/* Hidden with the pricing section.
              <li>
                <a href="#pricing" onClick={(event) => handleSectionLinkClick(event, "pricing")}>
                  Pricing
                </a>
              </li>
              */}
              {signedIn ? (
                <li>
                  <Link to="/app">Open ShopOS</Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login">Sign in</Link>
                  </li>
                  <li>
                    <Link to="/signup">Create account</Link>
                  </li>
                </>
              )}
            </ul>
          </nav>
        </div>
        <p className={styles.copyright}>© 2026 ShopOS</p>
      </div>
    </footer>
  );
}
