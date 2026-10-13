import { Camera, ImagePlus, Store } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Button, Spinner } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { resizeForUpload } from "../../lib/image";
import { useUploadShopPhoto } from "../../lib/queries";
import styles from "./ShopSetup.module.css";

export interface ShopPhotoPickerProps {
  photoUrl: string | null;
  shopName: string;
}

/**
 * The shop-front photo: take one with the camera or choose one, see it straight away, and it
 * uploads (shrunk in the browser first). Used by the setup screen and Settings.
 */
export function ShopPhotoPicker({ photoUrl, shopName }: ShopPhotoPickerProps) {
  const upload = useUploadShopPhoto();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const hintId = useId();
  const errorId = useId();

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // choosing the same file again still triggers a change
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    upload.reset();
    const blob = await resizeForUpload(file);
    upload.mutate(blob, { onSettled: () => setPreview(null) });
  }

  const shown = preview ?? photoUrl;
  const error = upload.isError ? errorMessage(upload.error) : null;

  return (
    <div className={styles.photoPicker}>
      <div className={styles.photoFrame} data-empty={!shown || undefined} aria-busy={upload.isPending || undefined}>
        {shown ? (
          <img src={shown} alt={`Photo of ${shopName}`} className={styles.photo} />
        ) : (
          <div className={styles.photoEmpty}>
            <Store aria-hidden="true" />
            <span>No photo yet</span>
          </div>
        )}
        {upload.isPending && (
          <div className={styles.photoBusy}>
            <Spinner size={22} label="Uploading the photo" />
            <span>Uploading…</span>
          </div>
        )}
      </div>
      <p id={hintId} className={styles.hint}>
        A clear photo of the shop front, with your signboard if you have one. Customers see it when they open their khata
        link.
      </p>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.photoActions}>
        <Button
          variant={shown ? "secondary" : "primary"}
          icon={<Camera aria-hidden="true" />}
          onClick={() => cameraRef.current?.click()}
          disabled={upload.isPending}
          aria-describedby={hintId}
        >
          {shown ? "Take a new photo" : "Take a photo"}
        </Button>
        <Button
          variant="secondary"
          icon={<ImagePlus aria-hidden="true" />}
          onClick={() => galleryRef.current?.click()}
          disabled={upload.isPending}
          aria-describedby={hintId}
        >
          Choose from gallery
        </Button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="visually-hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleChange}
      />
    </div>
  );
}
