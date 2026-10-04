import { ChevronDown, Download } from "lucide-react";
import { Button, Menu, useToast, type MenuEntry } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useDownloadCsv } from "../../../lib/queries";
import type { ExportKind, Permission } from "../../../lib/types";

interface ExportOption {
  kind: ExportKind;
  label: string;
  /** Any one of these permissions allows the export (mirrors the API rule). */
  allowedWith: readonly Permission[];
}

const EXPORT_OPTIONS: readonly ExportOption[] = [
  { kind: "orders", label: "Orders", allowedWith: ["settings", "reports"] },
  { kind: "payments", label: "Payments", allowedWith: ["settings", "reports"] },
  { kind: "customers", label: "Customers", allowedWith: ["settings"] },
  { kind: "products", label: "Products", allowedWith: ["settings"] },
  { kind: "expenses", label: "Expenses", allowedWith: ["settings"] },
];

/** "Export CSV" dropdown: downloads the exports this user is allowed to take. */
export function ExportMenu() {
  const { can } = useAuth();
  const toast = useToast();
  const download = useDownloadCsv();
  const options = EXPORT_OPTIONS.filter((option) => can(option.allowedWith));

  if (options.length === 0) return null;

  const start = (option: ExportOption) => {
    download.mutate(option.kind, {
      onSuccess: () => toast.success(`${option.label} CSV downloaded`),
      onError: (error) =>
        toast.error(`${option.label} CSV didn't download`, { description: errorMessage(error) }),
    });
  };

  const items: MenuEntry[] = [
    { type: "label", label: "Download a CSV file of" },
    ...options.map((option) => ({ key: option.kind, label: option.label, onSelect: () => start(option) })),
  ];

  return (
    <Menu
      label="Export CSV"
      items={items}
      renderTrigger={(trigger) => (
        <Button
          {...trigger}
          icon={<Download aria-hidden="true" />}
          iconRight={<ChevronDown size={16} aria-hidden="true" />}
          loading={download.isPending}
        >
          Export CSV
        </Button>
      )}
    />
  );
}
