import { Copy, Check } from "lucide-react";
import { LazyShopMap } from "../../../components/map";
import { Button, Card, Skeleton } from "../../../components/ui";
import { ShopLocationEditor } from "../../../features/shop-setup/ShopLocationEditor";
import { ShopPhotoPicker } from "../../../features/shop-setup/ShopPhotoPicker";
import { useAuth } from "../../../lib/auth";
import { useCopyToClipboard } from "../../../lib/hooks";
import { useShop } from "../../../lib/queries";
import type { Shop } from "../../../lib/types";
import styles from "./SettingsPage.module.css";

/** The shop's public ID, with a copy button (support asks for it). */
export function ShopIdRow({ shop }: { shop: Shop }) {
  const { copy, copied } = useCopyToClipboard();
  return (
    <div className={styles.shopIdRow}>
      <span className={styles.planLabel}>Shop ID</span>
      <strong className={styles.shopId}>{shop.code}</strong>
      <Button
        variant="ghost"
        size="sm"
        icon={copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        onClick={() => void copy(shop.code)}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

/** The shop-front photo and the map pin: what customers see on their khata link. */
export function ShopPresenceSection({ id }: { id: string }) {
  const { can, shop: sessionShop } = useAuth();
  const shopQuery = useShop();
  const shop = shopQuery.data ?? sessionShop;
  const editable = can("settings");

  return (
    <div id={id} tabIndex={-1} className={styles.anchor}>
      <Card title="Photo & location" description="Customers see both when they open their khata link.">
        {!shop ? (
          <Skeleton height={280} />
        ) : (
          <div className={styles.presence}>
            <div className={styles.presenceColumn}>
              <h3 className={styles.subheading}>Photo of your shop</h3>
              {editable ? (
                <ShopPhotoPicker photoUrl={shop.photo_url} shopName={shop.name} />
              ) : shop.photo_url ? (
                <img src={shop.photo_url} alt={`Photo of ${shop.name}`} className={styles.presencePhoto} />
              ) : (
                <p className={styles.readOnlyNote}>No photo yet.</p>
              )}
            </div>
            <div className={styles.presenceColumn}>
              <h3 className={styles.subheading}>Map pin</h3>
              {editable ? (
                <ShopLocationEditor key={`${shop.latitude},${shop.longitude}`} shop={shop} submitLabel="Save location" withAddress={false} />
              ) : (
                <LazyShopMap latitude={shop.latitude} longitude={shop.longitude} height={240} label={`Map showing ${shop.name}`} />
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
