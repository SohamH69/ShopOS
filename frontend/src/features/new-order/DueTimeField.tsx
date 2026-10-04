import { useState } from "react";
import { Button, Chip, Field, Input } from "../../components/ui";
import {
  addDaysISO,
  formatDue,
  fromDateTimeInputValue,
  istDateTime,
  toDateTimeInputValue,
  todayISO,
} from "../../lib/format";
import styles from "./DueTimeField.module.css";

export interface DueTimeFieldProps {
  /** "Pickup time" / "Delivery time". */
  label: string;
  /** ISO datetime, or null for no due time. */
  value: string | null;
  onChange: (value: string | null) => void;
}

const FIVE_MINUTES = 5 * 60_000;

/** An hour from now, rounded up to the next 5 minutes, as an IST ISO string. */
function inOneHour(): string {
  const rounded = Math.ceil((Date.now() + 60 * 60_000) / FIVE_MINUTES) * FIVE_MINUTES;
  return fromDateTimeInputValue(toDateTimeInputValue(rounded)) ?? new Date(rounded).toISOString();
}

function sameMoment(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && Date.parse(a) === Date.parse(b);
}

/** Optional promised time: quick picks for the usual answers, or any date and time. */
export function DueTimeField({ label, value, onChange }: DueTimeFieldProps) {
  const [hourPick, setHourPick] = useState<string | null>(null);
  const now = Date.now();
  const today = todayISO(now);
  const evening = istDateTime(today, 19);
  const tomorrowMorning = istDateTime(addDaysISO(today, 1), 10);
  // "This evening" only while there's still time to get it ready.
  const showEvening = Date.parse(evening) - now > 30 * 60_000;
  const due = formatDue(value, now);

  const pick = (at: string) => onChange(sameMoment(value, at) ? null : at);

  return (
    <Field label={label} optional hint={due ? due.text : undefined}>
      <div className={styles.field}>
        <div className={styles.chips} role="group" aria-label={`Quick ${label.toLowerCase()}`}>
          <Chip
            selected={sameMoment(value, hourPick)}
            onClick={() => {
              if (sameMoment(value, hourPick)) {
                onChange(null);
                return;
              }
              const at = inOneHour();
              setHourPick(at);
              onChange(at);
            }}
          >
            In 1 hour
          </Chip>
          {showEvening && (
            <Chip selected={sameMoment(value, evening)} onClick={() => pick(evening)}>
              This evening (7 pm)
            </Chip>
          )}
          <Chip selected={sameMoment(value, tomorrowMorning)} onClick={() => pick(tomorrowMorning)}>
            Tomorrow morning (10 am)
          </Chip>
        </div>
        <div className={styles.inputRow}>
          <Input
            type="datetime-local"
            className={styles.input}
            value={toDateTimeInputValue(value)}
            onChange={(event) => onChange(fromDateTimeInputValue(event.target.value))}
          />
          {value && (
            <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
              Clear
            </Button>
          )}
        </div>
      </div>
    </Field>
  );
}
