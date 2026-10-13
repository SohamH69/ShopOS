import { Link } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { useAuth } from "../../lib/auth";
import { SECTION_LINKS } from "./content";
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
            <p className={styles.mission}>Making it simple to run a small shop, with no technology expertise needed.</p>
          </div>

          <nav className={styles.columns} aria-label="Footer">
            <div>
              <h2 className={styles.heading}>On this page</h2>
              <ul className={styles.links}>
                {/* SECTION_LINKS already leaves out Pricing while that section is hidden. */}
                {SECTION_LINKS.map((link) => (
                  <li key={link.id}>
                    <a href={`#${link.id}`} onClick={(event) => handleSectionLinkClick(event, link.id)}>
                      {link.label}
                    </a>
                  </li>
                ))}
                <li>
                  <a href="#faq" onClick={(event) => handleSectionLinkClick(event, "faq")}>
                    Questions
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h2 className={styles.heading}>Your shop</h2>
              <ul className={styles.links}>
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
            </div>
          </nav>
        </div>

        <div className={styles.bottom}>
          <p>© 2026 ShopOS</p>
          <p>For kirana, pharmacy, hardware and every local shop</p>
        </div>
      </div>
    </footer>
  );
}
