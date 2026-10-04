import { Ban, MessageCircle, PackageCheck, Printer, RotateCcw, Undo2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog, Menu, type MenuEntry } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { completedStatusFor, ORDER_STATUS_ACTION, ORDER_STATUS_LABEL } from "../../lib/constants";
import { orderNo } from "../../lib/format";
import { useCustomer } from "../../lib/queries";
import type { Order, OrderDetail } from "../../lib/types";
import {
  hasWhatsAppNumber,
  orderConfirmationMessage,
  paymentReminderMessage,
  pickupReadyMessage,
  receiptMessage,
  waLink,
} from "../../lib/whatsapp";
import { useNewOrder } from "../new-order/NewOrderProvider";
import { repeatItemsOf } from "../new-order/orderDraft";
import { allowedNextStatuses, previousStatusFor, useChangeOrderStatus } from "./orderFlow";

export interface OrderActionsMenuProps {
  order: Order;
  /** Present once the full record has loaded; its next_statuses are the server's word on what's allowed. */
  detail: OrderDetail | undefined;
  /** Closes the drawer (Repeat order moves on to the new order sheet). */
  onClose: () => void;
}

/** The ⋯ menu in the drawer header: other status moves, repeat, print, WhatsApp messages, cancel. */
export function OrderActionsMenu({ order, detail, onClose }: OrderActionsMenuProps) {
  const { shop } = useAuth();
  const { openNewOrder } = useNewOrder();
  const { change, pendingStatus } = useChangeOrderStatus();
  const customer = useCustomer(order.customer_id);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const allowed = detail?.next_statuses ?? allowedNextStatuses(order.status, order.fulfillment);
  const done = completedStatusFor(order.fulfillment);
  const previous = previousStatusFor(order.status);
  // Ready orders already show "Mark collected" as a button; earlier steps can jump straight to it here.
  const offerDone = order.status !== "ready" && allowed.includes(done);
  const offerBack = previous !== null && allowed.includes(previous);
  const offerReopen = order.status === "cancelled" && allowed.includes("new");
  const offerCancel = allowed.includes("cancelled");

  const repeat = () => {
    onClose();
    openNewOrder({
      customerId: order.customer_id ?? undefined,
      items: repeatItemsOf(order.items),
      fulfillment: order.fulfillment,
      channel: order.channel,
    });
  };

  const phone = order.customer_phone;
  const canMessage = shop !== null && hasWhatsAppNumber(phone);
  const noPhoneHint = order.customer_id === null ? "Walk-in order, no phone number" : "No phone number for this customer";
  const owed = customer.data?.outstanding ?? order.outstanding;

  const message = (key: string, label: string, build: () => string, unavailable?: string): MenuEntry => {
    const reason = !canMessage ? noPhoneHint : unavailable;
    return reason
      ? { key, label, icon: <MessageCircle aria-hidden="true" />, disabled: true, hint: reason }
      : { key, label, icon: <MessageCircle aria-hidden="true" />, href: waLink(phone, build()), newTab: true };
  };

  const items: (MenuEntry | false | null)[] = [
    offerDone && {
      key: "done",
      label: ORDER_STATUS_ACTION[done],
      icon: <PackageCheck aria-hidden="true" />,
      onSelect: () => void change(order, done),
    },
    offerBack &&
      previous !== null && {
        key: "back",
        label: `Move back to ${ORDER_STATUS_LABEL[previous]}`,
        icon: <Undo2 aria-hidden="true" />,
        onSelect: () => void change(order, previous),
      },
    offerReopen && {
      key: "reopen",
      label: ORDER_STATUS_ACTION.new,
      icon: <Undo2 aria-hidden="true" />,
      onSelect: () => void change(order, "new"),
    },
    (offerDone || offerBack || offerReopen) && { type: "separator", key: "status-end" },
    {
      key: "repeat",
      label: "Repeat order",
      hint: "Same customer and items, at today's prices",
      icon: <RotateCcw aria-hidden="true" />,
      onSelect: repeat,
    },
    {
      key: "print",
      label: "Print receipt",
      icon: <Printer aria-hidden="true" />,
      href: `/app/orders/${order.id}/receipt?print=1`,
      newTab: true,
    },
    { type: "separator", key: "whatsapp-start" },
    { type: "label", key: "whatsapp", label: "Send on WhatsApp" },
    shop !== null && message("confirm", "Order confirmation", () => orderConfirmationMessage(order, shop)),
    shop !== null &&
      message("ready", order.fulfillment === "delivery" ? "Ready for delivery" : "Ready for pickup", () =>
        pickupReadyMessage(order, shop),
      ),
    shop !== null &&
      message(
        "reminder",
        "Payment reminder",
        () => paymentReminderMessage({ name: order.customer_name ?? "", outstanding: owed }, shop),
        owed > 0 ? undefined : "Nothing is due",
      ),
    shop !== null && message("receipt", "Send receipt", () => receiptMessage(order, shop)),
    offerCancel && { type: "separator", key: "cancel-start" },
    offerCancel && {
      key: "cancel",
      label: "Cancel order",
      tone: "danger",
      icon: <Ban aria-hidden="true" />,
      onSelect: () => {
        setCancelError(null);
        setConfirmCancel(true);
      },
    },
  ];

  const confirm = async () => {
    const updated = await change(order, "cancelled", { onError: setCancelError });
    if (updated) setConfirmCancel(false);
  };

  return (
    <>
      <Menu label={`Actions for order ${orderNo(order.number)}`} items={items} align="end" />
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => void confirm()}
        title={`Cancel order ${orderNo(order.number)}?`}
        description="It comes off pickups, sales and the customer's khata. You can reopen it later."
        confirmLabel="Cancel order"
        loading={pendingStatus(order.id) === "cancelled"}
        error={cancelError}
      />
    </>
  );
}
