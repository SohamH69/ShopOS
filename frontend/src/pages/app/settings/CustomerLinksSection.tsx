import { Card, Switch, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useShop, useUpdateShop } from "../../../lib/queries";
import styles from "./SettingsPage.module.css";

/** What customers can do on the khata link you share with them. Saves as soon as a switch moves. */
export function CustomerLinksSection({ id }: { id: string }) {
  const { shop: sessionShop } = useAuth();
  const shop = useShop().data ?? sessionShop;
  const update = useUpdateShop();
  const toast = useToast();

  function save(field: "portal_catalog" | "portal_orders", value: boolean) {
    // Ordering needs the product list, so turning the list off turns ordering off too.
    const body = field === "portal_catalog" && !value ? { portal_catalog: false, portal_orders: false } : { [field]: value };
    update.mutate(body, {
      onSuccess: () => toast.success("Saved", { description: "Customers see the change next time they open their link." }),
      onError: (error) => toast.error("Couldn't save", { description: errorMessage(error) }),
    });
  }

  return (
    <div id={id} tabIndex={-1} className={styles.anchor}>
      <Card
        title="Customer khata links"
        description="Share a customer's khata link from their page. They see their dues, orders and payments, and can pay by UPI."
      >
        <div className={styles.switches}>
          <Switch
            label="Show your products and prices"
            description="Customers can look through what you sell. Exact stock stays private; they only see in stock or out of stock."
            checked={shop?.portal_catalog ?? true}
            disabled={!shop || update.isPending}
            onCheckedChange={(checked) => save("portal_catalog", checked)}
          />
          <Switch
            label="Take orders from customers"
            description="Orders arrive in Orders and Pickups as New, marked Online, and show up first on Today."
            checked={(shop?.portal_catalog ?? true) && (shop?.portal_orders ?? true)}
            disabled={!shop || !shop.portal_catalog || update.isPending}
            onCheckedChange={(checked) => save("portal_orders", checked)}
          />
        </div>
      </Card>
    </div>
  );
}
