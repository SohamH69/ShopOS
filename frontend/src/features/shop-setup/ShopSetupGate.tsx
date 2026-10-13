import { CircleCheck, LogOut, RefreshCw } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Logo } from "../../components/brand/Logo";
import { Button, useToast } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { cx } from "../../lib/cx";
import { firstName } from "../../lib/format";
import { useDocumentTitle } from "../../lib/hooks";
import type { Shop } from "../../lib/types";
import { ShopLocationEditor } from "./ShopLocationEditor";
import { ShopPhotoPicker } from "./ShopPhotoPicker";
import styles from "./ShopSetup.module.css";

function Step({ number, title, done, children }: { number: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <section className={styles.step} aria-labelledby={`setup-step-${number}`}>
      <header className={styles.stepHead}>
        <span className={cx(styles.stepNumber, done && styles.stepDone)} aria-hidden="true">
          {done ? <CircleCheck /> : number}
        </span>
        <h2 id={`setup-step-${number}`} className={styles.stepTitle}>
          {title}
          {done && <span className="visually-hidden"> (done)</span>}
        </h2>
      </header>
      {children}
    </section>
  );
}

function SetupFrame({ title, lede, children }: { title: ReactNode; lede: string; children: ReactNode }) {
  const { logout } = useAuth();
  return (
    <div className={styles.page}>
      <header className={styles.board}>
        <span className={styles.awning} aria-hidden="true" />
        <div className={styles.boardInner}>
          <Logo tone="dark" size={26} />
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.lede}>{lede}</p>
        </div>
      </header>
      <main className={styles.main}>
        {children}
        <Button variant="ghost" size="sm" icon={<LogOut aria-hidden="true" />} onClick={logout} className={styles.signOut}>
          Sign out
        </Button>
      </main>
    </div>
  );
}

/** Photo, then map pin and address. The app opens by itself once both are saved. */
function ShopSetupPage({ shop, ownerName }: { shop: Shop; ownerName: string }) {
  useDocumentTitle("Set up your shop");
  const hasPhoto = Boolean(shop.photo_url);
  const hasLocation = shop.latitude !== null && shop.longitude !== null && shop.address.trim() !== "";
  return (
    <SetupFrame
      title={
        <>
          Set up <em>{shop.name}</em>
        </>
      }
      lede={`Hi ${firstName(ownerName)}. Two quick things before you start: a photo of your shop and where it is. Your customers see both when they open their khata link.`}
    >
      <p className={styles.code}>
        Your shop ID <strong className="mono">{shop.code}</strong>
      </p>
      <Step number={1} title="Photo of your shop" done={hasPhoto}>
        <ShopPhotoPicker photoUrl={shop.photo_url} shopName={shop.name} />
      </Step>
      <Step number={2} title="Where is your shop?" done={hasLocation}>
        <ShopLocationEditor shop={shop} submitLabel={hasPhoto ? "Save and open ShopOS" : "Save location"} />
      </Step>
    </SetupFrame>
  );
}

/** Staff can't set the shop up; they wait for someone with Settings access. */
function WaitingForSetup({ shop }: { shop: Shop }) {
  useDocumentTitle("Shop setup needed");
  const { refresh } = useAuth();
  return (
    <SetupFrame title={<>Almost ready</>} lede={`${shop.name} isn't set up on ShopOS yet.`}>
      <div className={styles.step}>
        <p className={styles.waiting}>
          Ask {shop.owner_name} to sign in and add a photo of the shop and its location. Then come back here.
        </p>
        <Button icon={<RefreshCw aria-hidden="true" />} onClick={() => void refresh()}>
          Check again
        </Button>
      </div>
    </SetupFrame>
  );
}

/**
 * Every shop needs its photo and map pin before the app opens (the server enforces the same).
 * A cached session from before this existed has no `setup_complete` yet: let it through while
 * the session revalidates rather than flash the setup screen.
 */
export function RequireShopSetup({ children }: { children: ReactNode }) {
  const { shop, user, can } = useAuth();
  const toast = useToast();
  const wasIncomplete = useRef(false);
  const incomplete = shop?.setup_complete === false;

  useEffect(() => {
    if (incomplete) wasIncomplete.current = true;
    else if (wasIncomplete.current && shop) {
      wasIncomplete.current = false;
      toast.success(`${shop.name} is set up`, { description: "Welcome to ShopOS." });
    }
  }, [incomplete, shop, toast]);

  if (!shop || !incomplete) return <>{children}</>;
  if (!can("settings")) return <WaitingForSetup shop={shop} />;
  return <ShopSetupPage shop={shop} ownerName={user?.name ?? shop.owner_name} />;
}
