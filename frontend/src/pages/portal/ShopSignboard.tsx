import { MapPin, MessageCircle, Navigation, Phone } from "lucide-react";
import { useState, type ReactNode } from "react";
import { directionsUrl } from "../../components/map";
import { formatPhone, telHref } from "../../lib/format";
import type { PortalCustomer, PortalShop } from "../../lib/types";
import { waLink } from "../../lib/whatsapp";
import { mapsSearchUrl, shopAddress } from "./portalModel";
import styles from "./ShopSignboard.module.css";

interface ActionProps {
  href: string;
  icon: ReactNode;
  children: ReactNode;
  newTab?: boolean;
  label?: string;
}

function BoardAction({ href, icon, children, newTab = false, label }: ActionProps) {
  return (
    <a
      className={styles.action}
      href={href}
      aria-label={label}
      target={newTab ? "_blank" : undefined}
      rel={newTab ? "noopener noreferrer" : undefined}
    >
      {icon}
      <span>{children}</span>
    </a>
  );
}

/** Where to go: directions to the pin, or a maps search for the address when there is no pin. */
export function shopDirectionsHref(shop: PortalShop): string | null {
  if (shop.latitude !== null && shop.longitude !== null) return directionsUrl(shop.latitude, shop.longitude);
  const address = shopAddress(shop.address, shop.city);
  return address ? mapsSearchUrl(`${shop.name}, ${address}`) : null;
}

export interface ShopSignboardProps {
  shop: PortalShop;
  customer: PortalCustomer;
}

/**
 * The shop's signboard: a night board under the marigold awning with the name painted on it,
 * the shopfront photo, and one-tap Call, WhatsApp and Directions.
 */
export function ShopSignboard({ shop, customer }: ShopSignboardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const address = shopAddress(shop.address, shop.city);
  const directions = shopDirectionsHref(shop);
  const showPhoto = Boolean(shop.photo_url) && !photoFailed;
  const greeting = `Namaste ${shop.name}, this is ${customer.name}.`;

  return (
    <header className={styles.board}>
      <span className={styles.awning} aria-hidden="true" />
      <div className={styles.inner}>
        <div className={styles.topline}>
          <p className={styles.eyebrow}>Your khata at</p>
          {shop.code && (
            <p className={styles.code}>
              <span className={styles.codeLabel}>Shop ID</span> <span className={styles.codeValue}>{shop.code}</span>
            </p>
          )}
        </div>
        <h1 className={styles.name}>{shop.name}</h1>
        {(address || shop.phone) && (
          <div className={styles.details}>
            {address && (
              <p className={styles.address}>
                <MapPin aria-hidden="true" />
                <span>{address}</span>
              </p>
            )}
            {shop.phone && (
              <p className={styles.phone}>
                <Phone aria-hidden="true" />
                <a href={telHref(shop.phone)}>{formatPhone(shop.phone)}</a>
              </p>
            )}
          </div>
        )}

        {showPhoto && shop.photo_url && (
          <div className={styles.photoFrame}>
            <img
              className={styles.photo}
              src={shop.photo_url}
              alt={`${shop.name} shopfront`}
              width={1200}
              height={800}
              decoding="async"
              onError={() => setPhotoFailed(true)}
            />
          </div>
        )}

        <div className={styles.actions} role="group" aria-label="Contact the shop">
          {shop.phone && (
            <BoardAction href={telHref(shop.phone)} icon={<Phone aria-hidden="true" />} label={`Call ${shop.name}`}>
              Call
            </BoardAction>
          )}
          {shop.phone && (
            <BoardAction
              href={waLink(shop.phone, greeting)}
              icon={<MessageCircle aria-hidden="true" />}
              label={`WhatsApp ${shop.name}`}
              newTab
            >
              WhatsApp
            </BoardAction>
          )}
          {directions && (
            <BoardAction href={directions} icon={<Navigation aria-hidden="true" />} label={`Directions to ${shop.name}`} newTab>
              Directions
            </BoardAction>
          )}
        </div>
      </div>
    </header>
  );
}

/** The board while the khata loads: same shape, no words. */
export function ShopSignboardSkeleton() {
  return (
    <header className={styles.board} aria-hidden="true">
      <span className={styles.awning} />
      <div className={styles.inner}>
        <span className={styles.ghost} style={{ width: 120, height: 14 }} />
        <span className={styles.ghost} style={{ width: "72%", height: 40, marginTop: 14 }} />
        <span className={styles.ghost} style={{ width: "88%", height: 14, marginTop: 16 }} />
        <span className={styles.ghostPhoto} />
        <div className={styles.actions}>
          <span className={styles.ghostAction} />
          <span className={styles.ghostAction} />
          <span className={styles.ghostAction} />
        </div>
      </div>
    </header>
  );
}
