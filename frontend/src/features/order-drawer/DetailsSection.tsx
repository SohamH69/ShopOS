import { Pencil } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button, DescriptionList, Field, SegmentedControl, Textarea, useToast, type DescriptionItem } from "../../components/ui";
import { errorMessage } from "../../lib/api";
import { CHANNEL_LABEL, FULFILLMENT_LABEL, isOpenStatus, toOptions } from "../../lib/constants";
import { formatDateTime, formatDue, orderNo } from "../../lib/format";
import { useUpdateOrder } from "../../lib/queries";
import type { Channel, Fulfillment, Order, OrderUpdate } from "../../lib/types";
import { DueTimeField } from "../new-order/DueTimeField";
import styles from "./OrderDrawer.module.css";

// "Online" (sent from the customer's khata link) is shown only on orders that came that way.
const CHANNEL_OPTIONS = toOptions(CHANNEL_LABEL, ["walk_in", "phone", "whatsapp"]);
const ONLINE_CHANNEL_OPTIONS = toOptions(CHANNEL_LABEL);
const FULFILLMENT_OPTIONS = toOptions(FULFILLMENT_LABEL);

function isItem(item: DescriptionItem | null): item is DescriptionItem {
  return item !== null;
}

function sameMoment(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

function DueValue({ order }: { order: Order }): ReactNode {
  if (!order.due_at) return <span className={styles.quietValue}>Not set</span>;
  const absolute = formatDateTime(order.due_at);
  if (!isOpenStatus(order.status)) return absolute;
  const due = formatDue(order.due_at);
  if (!due) return absolute;
  return (
    <span>
      <span className={due.overdue ? styles.overdueText : undefined}>{due.text}</span>
      <span className={styles.quietValue}> · {absolute}</span>
    </span>
  );
}

/** When it's due, where it goes, the note, who took it. Editable at any time. */
export function DetailsSection({ order }: { order: Order }) {
  const headingId = useId();
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const delivery = order.fulfillment === "delivery";

  const entries: (DescriptionItem | null)[] = [
    { key: "due", label: delivery ? "Delivery time" : "Pickup time", value: <DueValue order={order} /> },
    delivery
      ? {
          key: "address",
          label: "Delivery address",
          value: order.delivery_address || <span className={styles.quietValue}>Not added</span>,
        }
      : null,
    order.notes ? { key: "notes", label: "Note", value: <span className={styles.note}>{order.notes}</span> } : null,
    {
      key: "taken",
      label: "Taken by",
      value: `${order.created_by_name ?? "Someone at the shop"} · ${formatDateTime(order.created_at)}`,
    },
    order.completed_at
      ? {
          key: "completed",
          label: order.status === "delivered" ? "Delivered" : "Collected",
          value: formatDateTime(order.completed_at),
        }
      : null,
  ];
  const items = entries.filter(isItem);

  const finishEditing = () => {
    setEditing(false);
    window.requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h3 id={headingId} className={styles.sectionTitle}>
          Details
        </h3>
        {!editing && (
          <Button ref={editButtonRef} size="sm" variant="ghost" icon={<Pencil aria-hidden="true" />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
        )}
      </div>
      {editing ? <DetailsEditor order={order} onDone={finishEditing} /> : <DescriptionList items={items} />}
    </section>
  );
}

function DetailsEditor({ order, onDone }: { order: Order; onDone: () => void }) {
  const toast = useToast();
  const update = useUpdateOrder();
  const open = isOpenStatus(order.status);
  const [channel, setChannel] = useState<Channel>(order.channel);
  const [fulfillment, setFulfillment] = useState<Fulfillment>(order.fulfillment);
  const [dueAt, setDueAt] = useState<string | null>(order.due_at);
  const [address, setAddress] = useState(order.delivery_address);
  const [notes, setNotes] = useState(order.notes);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const body: OrderUpdate = {};
    if (channel !== order.channel) body.channel = channel;
    if (open && fulfillment !== order.fulfillment) body.fulfillment = fulfillment;
    if (open && !sameMoment(dueAt, order.due_at)) body.due_at = dueAt;
    if (fulfillment === "delivery" && address.trim() !== order.delivery_address) body.delivery_address = address.trim();
    if (notes.trim() !== order.notes) body.notes = notes.trim();
    if (Object.keys(body).length === 0) {
      onDone();
      return;
    }
    setError(null);
    try {
      const updated = await update.mutateAsync({ id: order.id, ...body });
      toast.success("Details saved", { description: orderNo(updated.number) });
      onDone();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented && !update.isPending) {
      event.preventDefault();
      onDone();
    }
  };

  return (
    <form
      className={styles.editor}
      noValidate
      onKeyDown={handleKeyDown}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className={styles.editorTwoUp}>
        <Field label="Order via">
          <SegmentedControl
            options={order.channel === "online" ? ONLINE_CHANNEL_OPTIONS : CHANNEL_OPTIONS}
            value={channel}
            onChange={setChannel}
            size="sm"
            block
          />
        </Field>
        {open && (
          <Field label="Pickup or delivery">
            <SegmentedControl options={FULFILLMENT_OPTIONS} value={fulfillment} onChange={setFulfillment} size="sm" block />
          </Field>
        )}
      </div>
      {fulfillment === "delivery" && (
        <Field label="Delivery address" optional hint={!address ? "Left empty, the customer's saved address is used." : undefined}>
          <Textarea rows={2} value={address} maxLength={500} onChange={(event) => setAddress(event.target.value)} />
        </Field>
      )}
      {open && (
        <DueTimeField label={fulfillment === "delivery" ? "Delivery time" : "Pickup time"} value={dueAt} onChange={setDueAt} />
      )}
      <Field label="Note" optional>
        <Textarea rows={2} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      {error && (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      )}
      <div className={styles.editActions}>
        <Button variant="ghost" onClick={onDone} disabled={update.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={update.isPending}>
          Save details
        </Button>
      </div>
    </form>
  );
}
