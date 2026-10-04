import { CircleCheck, Download, Info } from "lucide-react";
import { useId, useState } from "react";
import { Button, ButtonLink, SegmentedControl, useToast } from "../../components/ui";
import { useInstallPrompt, type InstallPrompt } from "../../lib/pwa";
import styles from "./GetAppSection.module.css";
import { GUIDE_OPTIONS, guideFor, installGuide, type GuidePlatform } from "./installGuide";
import { QrCode } from "./QrCode";

/** "Install the app": the native install button, a confirmation once installed, or step-by-step help. */
export function InstallCard() {
  const install = useInstallPrompt();
  const titleId = useId();

  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <header>
        <h3 id={titleId} className={styles.cardTitle}>
          Install the app
        </h3>
        <p className={styles.cardSub}>
          Works on Android, iPhone, Windows and Mac. Installs in seconds from your browser — no app store needed.
        </p>
      </header>
      <div className={styles.installLayout}>
        <div className={styles.installBody}>
          {install.isStandalone || install.isInstalled ? <Installed standalone={install.isStandalone} /> : <InstallOptions install={install} />}
        </div>
        <DownloadQr />
      </div>
    </article>
  );
}

function Installed({ standalone }: { standalone: boolean }) {
  return (
    <div className={styles.installed}>
      <div className={styles.installedRow}>
        <CircleCheck className={styles.installedIcon} size={20} aria-hidden="true" />
        <div>
          <p className={styles.installedTitle}>ShopOS is installed on this device</p>
          <p className={styles.quiet}>
            {standalone ? "You're using the app right now." : "Open it from your home screen or app list."}
          </p>
        </div>
      </div>
      <div>
        <ButtonLink to="/app" variant="primary">
          Open ShopOS
        </ButtonLink>
      </div>
    </div>
  );
}

type PromptState = "idle" | "prompting" | "dismissed";

function InstallOptions({ install }: { install: InstallPrompt }) {
  const toast = useToast();
  const [promptState, setPromptState] = useState<PromptState>("idle");
  const [guide, setGuide] = useState<GuidePlatform>(() => guideFor(install.platform));

  const handleInstall = async () => {
    setPromptState("prompting");
    const outcome = await install.promptInstall();
    if (outcome === "accepted") {
      setPromptState("idle");
      toast.success("ShopOS is installed", { description: "Open it from your home screen or app list." });
    } else {
      // The browser's prompt can only be used once; the written steps take over from here.
      setPromptState(outcome === "dismissed" ? "dismissed" : "idle");
    }
  };

  if (install.canInstall || promptState === "prompting") {
    const onComputer = install.platform !== "android" && install.platform !== "ios";
    return (
      <div className={styles.installNow}>
        <div>
          <Button
            variant="primary"
            size="lg"
            icon={<Download aria-hidden="true" />}
            loading={promptState === "prompting"}
            onClick={handleInstall}
          >
            Install ShopOS
          </Button>
        </div>
        <p className={styles.quiet}>
          Your browser asks you to confirm. ShopOS then gets its own icon
          {onComputer ? " and opens in its own window." : " on your home screen."}
        </p>
      </div>
    );
  }

  const { steps, note } = installGuide(guide, install.platform, install.browser);
  return (
    <div className={styles.manual}>
      {promptState === "dismissed" && (
        <p className={styles.notice} role="status">
          Install cancelled. You can still install ShopOS from your browser:
        </p>
      )}
      <SegmentedControl label="Your device" options={GUIDE_OPTIONS} value={guide} onChange={setGuide} size="sm" />
      <ol className={styles.steps} aria-label={`Steps for ${GUIDE_OPTIONS.find((option) => option.value === guide)?.label ?? "your device"}`}>
        {steps.map((step, index) => (
          <li key={step.key} className={styles.step}>
            <span className={styles.stepNo}>{index + 1}</span>
            <span>{step.content}</span>
          </li>
        ))}
      </ol>
      {note && (
        <p className={styles.note}>
          <Info size={16} aria-hidden="true" />
          <span>{note}</span>
        </p>
      )}
      <p className={styles.quiet}>Already installed it? Open ShopOS from your home screen or app list.</p>
    </div>
  );
}

/** A QR code of this site's /download page, so a phone can pick up where the computer is. */
function DownloadQr() {
  const downloadUrl = `${window.location.origin}/download`;
  const displayUrl = downloadUrl.replace(/^https?:\/\//, "");
  return (
    <figure className={styles.qr}>
      <div className={styles.qrFrame}>
        <QrCode value={downloadUrl} label={`QR code that opens ${displayUrl}`} />
      </div>
      <figcaption className={styles.qrCaption}>
        <span className={styles.qrTitle}>Scan to open on your phone</span>
        <span className={styles.qrUrl}>{displayUrl}</span>
      </figcaption>
    </figure>
  );
}
