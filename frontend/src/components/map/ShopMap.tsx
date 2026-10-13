import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { cx } from "../../lib/cx";
import styles from "./ShopMap.module.css";

export interface ShopMapProps {
  latitude: number | null;
  longitude: number | null;
  /** Makes the pin movable: drag it, or tap the map to drop it there. */
  onChange?: (latitude: number, longitude: number) => void;
  /**
   * false: a picture of the map (no dragging, zooming or taps), so a finger on it scrolls the page.
   * Default true. Ignored when `onChange` is set.
   */
  interactive?: boolean;
  /** Map height in px (default 260). */
  height?: number;
  /** Zoom with a pin (default 16; India-wide without one). */
  zoom?: number;
  /** Describes the map for screen readers, e.g. "Map showing Raj Local Mart". */
  label: string;
  className?: string;
}

const INDIA: L.LatLngTuple = [21.5, 79.0];
const INDIA_ZOOM = 4;

/** The ShopOS map pin: a marigold drop with the shopfront's white counter in it. */
const PIN = L.divIcon({
  className: styles.pinIcon,
  html: `<span class="${styles.pin}"><span class="${styles.pinDot}"></span></span>`,
  iconSize: [36, 44],
  iconAnchor: [18, 42],
});

/**
 * An OpenStreetMap map with the shop's pin. Read-only by default; pass `onChange` to let people
 * move the pin. Load it through `LazyShopMap` so Leaflet only downloads where a map is shown.
 */
export default function ShopMap({
  latitude,
  longitude,
  onChange,
  interactive = true,
  height = 260,
  zoom = 16,
  label,
  className,
}: ShopMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const editable = Boolean(onChange);
  const movable = editable || interactive;

  // Create the map once.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const map = L.map(node, {
      center: latitude !== null && longitude !== null ? [latitude, longitude] : INDIA,
      zoom: latitude !== null && longitude !== null ? zoom : INDIA_ZOOM,
      zoomControl: movable,
      attributionControl: true,
      scrollWheelZoom: false,
      dragging: movable,
      touchZoom: movable,
      doubleClickZoom: movable,
      boxZoom: movable,
      keyboard: movable,
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    // The map may mount inside a sheet that is still animating open; measure again once it settles.
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(node);
    return () => {
      resize.disconnect();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; later changes are applied below
  }, []);

  // Taps on the map move the pin (only when editable).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !editable) return undefined;
    const handleClick = (event: L.LeafletMouseEvent) => onChangeRef.current?.(event.latlng.lat, event.latlng.lng);
    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [editable]);

  // Keep the pin (and the view) in step with the props.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (latitude === null || longitude === null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    const position: L.LatLngTuple = [latitude, longitude];
    if (!markerRef.current) {
      const marker = L.marker(position, { icon: PIN, draggable: editable, keyboard: false, title: label });
      marker.on("dragend", () => {
        const next = marker.getLatLng();
        onChangeRef.current?.(next.lat, next.lng);
      });
      marker.addTo(map);
      markerRef.current = marker;
      map.setView(position, Math.max(map.getZoom(), zoom));
    } else {
      markerRef.current.setLatLng(position);
      if (!map.getBounds().pad(-0.2).contains(position)) map.panTo(position);
    }
    if (markerRef.current.dragging) {
      if (editable) markerRef.current.dragging.enable();
      else markerRef.current.dragging.disable();
    }
  }, [latitude, longitude, editable, label, zoom]);

  return (
    <div
      ref={containerRef}
      className={cx(styles.map, editable && styles.editable, !movable && styles.still, className)}
      style={{ height }}
      role="img"
      aria-label={label}
    />
  );
}
