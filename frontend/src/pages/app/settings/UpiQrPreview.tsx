import { create } from "qrcode";
import { useMemo } from "react";
import { upiPaymentUri } from "../../../lib/upi";
import styles from "./SettingsPage.module.css";

const QUIET_ZONE = 2;

interface QrShape {
  path: string;
  dimension: number;
}

/** One path for all dark modules, merging horizontal runs. Null if the text can't be encoded. */
function qrShape(text: string): QrShape | null {
  try {
    const { modules } = create(text, { errorCorrectionLevel: "M" });
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
        path += `M${start + QUIET_ZONE} ${row + QUIET_ZONE}h${col - start}v1h-${col - start}z`;
      }
    }
    return { path, dimension: count + QUIET_ZONE * 2 };
  } catch {
    return null;
  }
}

export interface UpiQrPreviewProps {
  upiId: string;
  payeeName: string;
}

/**
 * The QR customers will see on receipts with dues, so the owner can scan it once with their own
 * UPI app and be sure payments reach the right account.
 */
export function UpiQrPreview({ upiId, payeeName }: UpiQrPreviewProps) {
  const uri = upiPaymentUri({ upiId, payeeName: payeeName.trim() || "Shop" });
  const shape = useMemo(() => qrShape(uri), [uri]);
  if (!shape) return null;
  return (
    <figure className={styles.qrPreview}>
      <span className={styles.qrBox}>
        <svg
          viewBox={`0 0 ${shape.dimension} ${shape.dimension}`}
          role="img"
          aria-label={`UPI QR code for ${upiId}`}
          shapeRendering="crispEdges"
          focusable="false"
        >
          <path className={styles.qrModules} d={shape.path} />
        </svg>
      </span>
      <figcaption className={styles.qrCaption}>Scan with your UPI app to check it opens your account.</figcaption>
    </figure>
  );
}
