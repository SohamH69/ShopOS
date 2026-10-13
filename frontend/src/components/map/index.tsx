import { lazy, Suspense } from "react";
import { Skeleton } from "../ui";
import type { ShopMapProps } from "./ShopMap";

const ShopMap = lazy(() => import("./ShopMap"));

export type { ShopMapProps };

/** The shop map, with Leaflet downloaded only when a map is actually on screen. */
export function LazyShopMap(props: ShopMapProps) {
  return (
    <Suspense fallback={<Skeleton width="100%" height={props.height ?? 260} radius={12} />}>
      <ShopMap {...props} />
    </Suspense>
  );
}

/** "https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>": opens directions in the phone's maps app. */
export function directionsUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
}
