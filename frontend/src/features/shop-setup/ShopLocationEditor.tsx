import { Crosshair } from "lucide-react";
import { useState, type FormEvent } from "react";
import { LazyShopMap } from "../../components/map";
import { Button, Field, Input, Textarea } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { useUpdateShop } from "../../lib/queries";
import type { Shop } from "../../lib/types";
import styles from "./ShopSetup.module.css";

export interface ShopLocationEditorProps {
  shop: Shop;
  submitLabel: string;
  /** Edit the address and city here too (default). Settings edits them in the profile form. */
  withAddress?: boolean;
  /** Called after a successful save. */
  onSaved?: (shop: Shop) => void;
}

interface Pin {
  latitude: number;
  longitude: number;
}

const PIN_NEEDED = "Put the pin on your shop: use your current location, or tap the map.";

/** Best effort: an address for the pin from OpenStreetMap, to save typing. Never blocks saving. */
async function lookUpAddress(pin: Pin): Promise<{ address: string; city: string } | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${pin.latitude}&lon=${pin.longitude}`,
      { headers: { Accept: "application/json", "Accept-Language": "en" }, signal: controller.signal },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      display_name?: string;
      address?: Record<string, string | undefined>;
    };
    const parts = data.address ?? {};
    const city = parts.city ?? parts.town ?? parts.village ?? parts.suburb ?? parts.state_district ?? "";
    const address = (data.display_name ?? "").split(", ").slice(0, 5).join(", ");
    return address ? { address, city } : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function locationError(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return "Location is turned off for ShopOS. Allow it in your browser, or tap the map at your shop.";
  }
  return "Couldn't find your location. Tap the map at your shop instead.";
}

/**
 * The shop's map pin and address: "Use my current location", drag or tap to adjust, then save.
 * Used by the setup screen and Settings.
 */
export function ShopLocationEditor({ shop, submitLabel, withAddress = true, onSaved }: ShopLocationEditorProps) {
  const update = useUpdateShop();
  const [pin, setPin] = useState<Pin | null>(
    shop.latitude !== null && shop.longitude !== null ? { latitude: shop.latitude, longitude: shop.longitude } : null,
  );
  const [address, setAddress] = useState(shop.address);
  const [city, setCity] = useState(shop.city);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ pin?: string; address?: string }>({});
  const secure = typeof window === "undefined" || window.isSecureContext;

  const changed =
    address.trim() !== shop.address ||
    city.trim() !== shop.city ||
    pin?.latitude !== (shop.latitude ?? undefined) ||
    pin?.longitude !== (shop.longitude ?? undefined);

  function movePin(latitude: number, longitude: number) {
    setPin({ latitude, longitude });
    setErrors((current) => ({ ...current, pin: undefined }));
  }

  function useCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setNotice("This browser can't share its location. Tap the map at your shop instead.");
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        movePin(next.latitude, next.longitude);
        setNotice("Pin placed where you are. Drag it if it's not exactly on your shop.");
        if (!address.trim()) {
          void lookUpAddress(next).then((found) => {
            if (!found) return;
            setAddress((current) => current || found.address);
            setCity((current) => current || found.city);
          });
        }
      },
      (error) => {
        setLocating(false);
        setNotice(locationError(error));
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (!pin) nextErrors.pin = PIN_NEEDED;
    if (withAddress && !address.trim()) nextErrors.address = "Enter the shop's address, so customers can find it.";
    setErrors(nextErrors);
    if (!pin || nextErrors.address) return;
    const place = withAddress ? { address: address.trim(), city: city.trim() } : {};
    update.mutate(
      { ...place, latitude: pin.latitude, longitude: pin.longitude },
      { onSuccess: (saved) => onSaved?.(saved) },
    );
  }

  return (
    <form className={styles.location} onSubmit={handleSubmit} noValidate>
      <div className={styles.locateRow}>
        <Button
          variant={pin ? "secondary" : "primary"}
          icon={<Crosshair aria-hidden="true" />}
          onClick={useCurrentLocation}
          loading={locating}
          disabled={!secure}
        >
          Use my current location
        </Button>
        {!secure && <p className={styles.hint}>Your location needs a secure (https) connection. Tap the map instead.</p>}
      </div>
      <LazyShopMap
        latitude={pin?.latitude ?? null}
        longitude={pin?.longitude ?? null}
        onChange={movePin}
        height={280}
        label={pin ? `Map with the pin on ${shop.name}` : "Map of India. Tap where your shop is."}
      />
      <p className={styles.hint} role="status">
        {notice ?? (pin ? "Drag the pin, or tap the map, to put it exactly on your shop." : "Tap the map where your shop is.")}
      </p>
      {errors.pin && (
        <p className={styles.error} role="alert">
          {errors.pin}
        </p>
      )}
      {withAddress && (
        <>
          <Field label="Shop address" error={errors.address}>
            <Textarea
              rows={2}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Shop number, building, road, area"
              autoComplete="street-address"
            />
          </Field>
          <Field label="City" optional>
            <Input value={city} onChange={(event) => setCity(event.target.value)} autoComplete="address-level2" />
          </Field>
        </>
      )}
      {update.isError && (
        <p className={styles.error} role="alert">
          {errorMessage(update.error)}
        </p>
      )}
      <div className={styles.formActions}>
        <Button type="submit" variant="primary" loading={update.isPending} disabled={!changed && Boolean(pin)}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
