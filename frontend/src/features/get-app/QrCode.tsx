import { create } from "qrcode";
import { useMemo } from "react";
import { cx } from "../../lib/cx";
import styles from "./QrCode.module.css";

export interface QrCodeProps {
  /** Text to encode, usually a URL. */
  value: string;
  /** Accessible description, e.g. "QR code that opens shopos.app/download". */
  label: string;
  className?: string;
}

/** Light modules kept around the code; the paper around the SVG adds more quiet zone. */
const QUIET_ZONE = 2;

interface QrShape {
  path: string;
  dimension: number;
}

/** One SVG path for every dark module, merging horizontal runs to keep the path short. */
function qrShape(value: string): QrShape | null {
  try {
    const { modules } = create(value, { errorCorrectionLevel: "M" });
    const count = modules.size;
    let path = "";
    for (let row = 0; row < count; row += 1) {
      let col = 0;
      while (col < count) {
        if (!modules.get(row, col)) {
          col += 1;
          continue;
        }
        const start = col;
        while (col < count && modules.get(row, col)) col += 1;
        const run = col - start;
        path += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`;
      }
    }
    return { path, dimension: count + QUIET_ZONE * 2 };
  } catch {
    // Only happens for text too long to encode, which a URL never is.
    return null;
  }
}

/** A real, scannable QR code drawn as crisp SVG in ink on paper. Size it with CSS. */
export function QrCode({ value, label, className }: QrCodeProps) {
  const shape = useMemo(() => qrShape(value), [value]);
  if (!shape) return null;
  return (
    <svg
      className={cx(styles.qr, className)}
      viewBox={`0 0 ${shape.dimension} ${shape.dimension}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      focusable="false"
    >
      <rect className={styles.paper} width={shape.dimension} height={shape.dimension} />
      <path className={styles.ink} d={shape.path} />
    </svg>
  );
}
