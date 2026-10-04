import { ArrowRight, ChevronRight, Menu as MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/brand/Logo";
import { Button, ButtonLink, IconButton, Modal } from "../../components/ui";
import { useDemoLogin } from "../../features/get-app/useDemoLogin";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import { SECTION_LINKS } from "./content";
import { handleSectionLinkClick } from "./scrollToSection";
import styles from "./SiteHeader.module.css";

export interface SiteHeaderProps {
  /** "full" (landing): section links, Sign in + Try the demo, and a menu sheet on phones. "minimal": logo and Sign in. */
  variant?: "full" | "minimal";
}

/** True once the page has scrolled, so the header can draw its bottom rule. */
function useScrolled(threshold = 4): boolean {
  const [scrolled, setScrolled] = useState(() => window.scrollY > threshold);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > threshold);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [threshold]);
  return scrolled;
}

/** Sticky header for the public pages. Signed-in visitors get "Open ShopOS" instead of Sign in. */
export function SiteHeader({ variant = "full" }: SiteHeaderProps) {
  const { status } = useAuth();
  const signedIn = status === "signedIn";
  const { openDemo, pending } = useDemoLogin();
  const [menuOpen, setMenuOpen] = useState(false);
  const scrolled = useScrolled();
  const full = variant === "full";

  return (
    <header className={cx(styles.header, full && styles.full)} data-scrolled={scrolled || undefined}>
      <div className={styles.inner}>
        <Link to="/" className={styles.logo} aria-label="ShopOS home">
          <Logo size={28} />
        </Link>

        {full && (
          <nav className={styles.nav} aria-label="Sections">
            {SECTION_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                className={styles.navLink}
                onClick={(event) => handleSectionLinkClick(event, link.id)}
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className={styles.actions}>
          {signedIn ? (
            <ButtonLink to="/app" variant="primary" iconRight={<ArrowRight aria-hidden="true" />}>
              Open ShopOS
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/login" variant="ghost">
                Sign in
              </ButtonLink>
              {full && (
                <Button variant="primary" onClick={openDemo} loading={pending}>
                  Try the demo
                </Button>
              )}
            </>
          )}
        </div>

        {full && (
          <IconButton
            className={styles.menuButton}
            label="Menu"
            icon={<MenuIcon aria-hidden="true" />}
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          />
        )}
      </div>

      {full && (
        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" placement="bottom">
          <nav aria-label="Sections">
            <ul className={styles.sheetLinks}>
              {SECTION_LINKS.map((link) => (
                <li key={link.id}>
                  <a
                    href={`#${link.id}`}
                    className={styles.sheetLink}
                    onClick={(event) => handleSectionLinkClick(event, link.id, () => setMenuOpen(false))}
                  >
                    <span>{link.label}</span>
                    <ChevronRight size={18} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.sheetActions}>
            {signedIn ? (
              <ButtonLink to="/app" variant="primary" size="lg" block>
                Open ShopOS
              </ButtonLink>
            ) : (
              <>
                <Button variant="primary" size="lg" block onClick={openDemo} loading={pending}>
                  Try the demo
                </Button>
                <ButtonLink to="/login" size="lg" block>
                  Sign in
                </ButtonLink>
              </>
            )}
          </div>
        </Modal>
      )}
    </header>
  );
}
