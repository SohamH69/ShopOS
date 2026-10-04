import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, Stamp } from "../../components/ui";
import { cx } from "../../lib/cx";
import { formatMoney } from "../../lib/format";
import { usePrefersReducedMotion } from "../../lib/hooks";
import styles from "./Parchi.module.css";

type OrderStage = "new" | "preparing" | "ready" | "collected";
type PaymentStage = "unpaid" | "partial" | "paid";

interface TrackStep<T extends string> {
  value: T;
  label: string;
}

interface Frame {
  order: OrderStage;
  payment: PaymentStage;
  paid: number;
  time: string;
  event: string;
}

const TOTAL = 658;

const ORDER_STEPS: readonly TrackStep<OrderStage>[] = [
  { value: "new", label: "New" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "collected", label: "Collected" },
];

const PAYMENT_STEPS: readonly TrackStep<PaymentStage>[] = [
  { value: "unpaid", label: "Unpaid" },
  { value: "partial", label: "Partial ₹300" },
  { value: "paid", label: "Paid" },
];

// The order and the payment move independently: the customer pays part, collects the goods with
// the rest on khata, and settles later. The PAID stamp lands on the last frame.
const FRAMES: readonly Frame[] = [
  { order: "new", payment: "unpaid", paid: 0, time: "6:10 pm", event: "Order received on WhatsApp" },
  { order: "preparing", payment: "unpaid", paid: 0, time: "6:12 pm", event: "Packing started" },
  { order: "ready", payment: "unpaid", paid: 0, time: "6:25 pm", event: "Ready for pickup" },
  { order: "ready", payment: "partial", paid: 300, time: "6:41 pm", event: "₹300 paid by UPI" },
  { order: "collected", payment: "partial", paid: 300, time: "6:42 pm", event: "Collected · ₹358 to khata" },
  { order: "collected", payment: "paid", paid: TOTAL, time: "Next day", event: "₹358 paid in cash" },
];
const LAST_FRAME = FRAMES.length - 1;

/** When each frame shows, in ms after the slip comes into view. */
const FRAME_AT = [0, 1000, 2000, 3200, 4300, 5500];
/** The stamp has pressed in and its ink halo has faded: offer Replay. */
const SETTLED_AT = 6500;

function useParchiDemo(reduceMotion: boolean) {
  const [frame, setFrame] = useState(0);
  /** 0 until the demo first plays; each play (and replay) increments it. */
  const [run, setRun] = useState(0);
  const [settled, setSettled] = useState(false);
  const [everSettled, setEverSettled] = useState(false);

  useEffect(() => {
    if (run === 0 || reduceMotion) return undefined;
    const timers = FRAME_AT.map((at, index) => window.setTimeout(() => setFrame(index), at));
    timers.push(
      window.setTimeout(() => {
        setSettled(true);
        setEverSettled(true);
      }, SETTLED_AT),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [run, reduceMotion]);

  const play = useCallback(() => {
    setFrame(0);
    setSettled(false);
    setRun((count) => count + 1);
  }, []);

  return {
    // Reduced motion: the finished slip, straight away and without movement.
    frame: reduceMotion ? LAST_FRAME : frame,
    run,
    animating: !reduceMotion && run > 0,
    playing: !reduceMotion && run > 0 && !settled,
    showReplay: !reduceMotion && everSettled,
    play,
  };
}

function Track<T extends string>({
  label,
  kind,
  steps,
  current,
}: {
  label: string;
  kind: "order" | "payment";
  steps: readonly TrackStep<T>[];
  current: T;
}) {
  const labelId = useId();
  const currentIndex = steps.findIndex((step) => step.value === current);
  return (
    <div className={styles.track}>
      <p id={labelId} className={styles.trackLabel}>
        {label}
      </p>
      <ol className={cx(styles.steps, styles[kind])} aria-labelledby={labelId}>
        {steps.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "todo";
          return (
            <li
              key={step.value}
              className={styles.step}
              data-state={state}
              data-stage={step.value}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className={styles.rail} aria-hidden="true">
                <span className={styles.node} />
                {index < steps.length - 1 && (
                  <span className={styles.connector}>
                    <span className={styles.fill} />
                  </span>
                )}
              </span>
              <span className={styles.stepLabel}>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The hero's live order slip. On first view it plays once through six frames, the order and the
 * payment moving on separate tracks, until the violet PAID stamp lands; then it rests with Replay.
 */
export function Parchi() {
  const reduceMotion = usePrefersReducedMotion();
  const { frame, run, animating, playing, showReplay, play } = useParchiDemo(reduceMotion);
  const rootRef = useRef<HTMLElement>(null);
  const captionId = useId();

  // Play once, the first time most of the slip is on screen.
  useEffect(() => {
    if (reduceMotion || run > 0) return undefined;
    const node = rootRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      play();
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          play();
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [reduceMotion, run, play]);

  const current = FRAMES[frame];
  const due = TOTAL - current.paid;
  const stamped = frame === LAST_FRAME;

  return (
    <figure ref={rootRef} className={styles.figure} aria-labelledby={captionId}>
      <figcaption id={captionId} className="visually-hidden">
        Example order slip: order #1045 for Rahul Sharma, received on WhatsApp. 5 kg Basmati rice ₹460 and 1 Tea
        powder 500g ₹198, total ₹658. The order moves from New to Preparing, Ready and Collected, while the payment
        moves on its own from Unpaid to Partial ₹300 to Paid, and a violet PAID stamp lands on the slip.
      </figcaption>
      <div className={styles.counter}>
        <div className={styles.lift}>
          <div className={styles.slip} data-stamped={animating && stamped ? "" : undefined}>
            <header className={styles.head}>
              <p className={styles.shop}>Raj Local Mart</p>
              <p className={styles.orderLine}>
                <span className={styles.orderNo}>#1045</span> · Rahul Sharma · WhatsApp
              </p>
            </header>

            <ul className={styles.items}>
              <li>
                <span>5 kg Basmati rice</span>
                <span className={styles.amount}>{formatMoney(460)}</span>
              </li>
              <li>
                <span>1 Tea powder 500g</span>
                <span className={styles.amount}>{formatMoney(198)}</span>
              </li>
            </ul>

            <div className={styles.totalsWrap}>
              <dl className={styles.totals}>
                <div className={styles.totalRow}>
                  <dt>Total</dt>
                  <dd>{formatMoney(TOTAL)}</dd>
                </div>
                <div className={styles.paidRow} data-zero={current.paid === 0 || undefined}>
                  <dt>Paid</dt>
                  <dd>
                    <span key={current.paid} className={styles.tick}>
                      {formatMoney(current.paid)}
                    </span>
                  </dd>
                </div>
                <div className={styles.dueRow} data-zero={due === 0 || undefined}>
                  <dt>Due</dt>
                  <dd>
                    <span key={due} className={styles.tick}>
                      {formatMoney(due)}
                    </span>
                  </dd>
                </div>
              </dl>
              {stamped && <Stamp key={run} label="Paid" size="lg" animate={animating} className={styles.stamp} />}
            </div>

            <div className={styles.tracks}>
              <Track label="Order" kind="order" steps={ORDER_STEPS} current={current.order} />
              <Track label="Payment" kind="payment" steps={PAYMENT_STEPS} current={current.payment} />
            </div>

            <p className={styles.log}>
              <span key={frame} className={styles.tick}>
                <span className={styles.logTime}>{current.time}</span> · {current.event}
              </span>
            </p>
          </div>
        </div>

        <div className={styles.replayRow} data-visible={showReplay || undefined}>
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw aria-hidden="true" />}
            aria-disabled={playing || undefined}
            onClick={() => {
              if (!playing) play();
            }}
          >
            Replay
          </Button>
        </div>
      </div>
    </figure>
  );
}
