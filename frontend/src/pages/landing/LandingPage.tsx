import { useEffect } from "react";
import GetAppSection from "../../features/get-app/GetAppSection";
import { useDocumentTitle } from "../../lib/hooks";
import { ClosingCta } from "./ClosingCta";
import { Faq } from "./Faq";
import { NeedsAttention, WhatsInside } from "./Features";
import { Hero } from "./Hero";
import { HowItWorks } from "./HowItWorks";
import { KhataSection } from "./KhataSection";
import layout from "./Landing.module.css";
// Pricing is hidden for now. To bring it back, restore this import and <Pricing /> below.
// import { Pricing } from "./Pricing";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

/**
 * Arriving at /#pricing (e.g. from Settings → "Change plan") after this page's code loaded late:
 * jump to the section once it exists. The app's scroll manager handles the fast case too.
 */
function useScrollToHashOnLoad() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
}

/** The public site's single job: get a shopkeeper started: install, open in the browser, or try the demo. */
export default function LandingPage() {
  useDocumentTitle("ShopOS: run your shop from one place", { exact: true });
  useScrollToHashOnLoad();

  return (
    <div className={layout.page}>
      <a href="#main" className={layout.skipLink}>
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" tabIndex={-1} className={layout.main}>
        <Hero />
        <HowItWorks />
        <NeedsAttention />
        <WhatsInside />
        <KhataSection />
        {/* <Pricing /> */}
        <div className={layout.band}>
          <div className={layout.container}>
            <GetAppSection />
          </div>
        </div>
        <Faq />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}
