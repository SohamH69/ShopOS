import { CircleAlert, Download, FileUp } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Card, SegmentedControl, Textarea, useToast } from "../../../components/ui";
import { errorMessage } from "../../../lib/api";
import { saveTextFile } from "../../../lib/files";
import { pluralize, todayISO } from "../../../lib/format";
import { useDownloadCsv, useImportCsv } from "../../../lib/queries";
import type { ExportKind, ImportKind, ImportResult } from "../../../lib/types";
import { analyzeCsv, fileProblem, readCsvFile, templateCsv, templateHeader } from "./csv";
import styles from "./SettingsPage.module.css";

const IMPORT_KINDS: { value: ImportKind; label: string }[] = [
  { value: "customers", label: "Customers" },
  { value: "products", label: "Products" },
];

const EXPORTS: { kind: ExportKind; label: string }[] = [
  { kind: "orders", label: "Orders" },
  { kind: "customers", label: "Customers" },
  { kind: "products", label: "Products" },
  { kind: "payments", label: "Payments" },
  { kind: "expenses", label: "Expenses" },
];

function ImportSummary({ result }: { result: ImportResult }) {
  return (
    <div className={styles.importResult} role="status">
      <p>
        <strong>{result.created} added</strong>
        {" · "}
        {result.updated} updated · {result.skipped} skipped
      </p>
      {result.errors.length > 0 && (
        <ul className={styles.importErrors}>
          {result.errors.slice(0, 20).map((error) => (
            <li key={`${error.row}-${error.message}`}>
              <span className="mono">Row {error.row}</span> {error.message}
            </li>
          ))}
          {result.errors.length > 20 && <li>and {result.errors.length - 20} more rows with problems.</li>}
        </ul>
      )}
    </div>
  );
}

/** Bring an existing customer or product list in from CSV, and take any list out as CSV. */
export function DataSection({ id }: { id: string }) {
  const toast = useToast();
  const importCsv = useImportCsv();
  const downloadCsv = useDownloadCsv();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("customers");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const analysis = useMemo(() => (text.trim() ? analyzeCsv(text, kind) : null), [text, kind]);

  const reset = () => {
    setText("");
    setFileName(null);
    setReadError(null);
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setResult(null);
    const problem = fileProblem(file);
    if (problem) {
      setReadError(problem);
      return;
    }
    try {
      setText(await readCsvFile(file));
      setFileName(file.name);
      setReadError(null);
    } catch (error) {
      setReadError(errorMessage(error));
    }
  };

  const handleImport = () => {
    if (!analysis || analysis.problem) return;
    importCsv.mutate(
      { kind, csv: analysis.uploadText },
      {
        onSuccess: (imported) => {
          setResult(imported);
          toast.success(`${kind === "customers" ? "Customers" : "Products"} imported`, {
            description: `${imported.created} added, ${imported.updated} updated`,
          });
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const handleExport = (exportKind: ExportKind) => {
    downloadCsv.mutate(exportKind, { onError: (error) => toast.error(errorMessage(error)) });
  };

  const problem = readError ?? analysis?.problem ?? null;

  return (
    <div id={id} tabIndex={-1} className={styles.anchor}>
      <Card title="Import & export" description="Bring your existing lists into ShopOS, or download your data as CSV.">
        <div className={styles.dataBlock}>
          <div className={styles.dataHead}>
            <p className={styles.subheading}>Import from a CSV file</p>
            <SegmentedControl
              label="What to import"
              size="sm"
              options={IMPORT_KINDS}
              value={kind}
              onChange={(value) => {
                setKind(value);
                setResult(null);
              }}
            />
          </div>
          <p className={styles.subdescription}>
            Expected columns: <code className={styles.code}>{templateHeader(kind)}</code>{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => saveTextFile(`shopos-${kind}-template.csv`, templateCsv(kind))}
            >
              Download template
            </button>
          </p>

          <div className={styles.importInputs}>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="visually-hidden"
              id={`${id}-file`}
              onChange={(event) => void handleFile(event)}
            />
            <Button icon={<FileUp aria-hidden="true" />} onClick={() => fileInput.current?.click()}>
              Choose CSV file
            </Button>
            <span className={styles.fileName}>{fileName ?? "or paste rows below (copied from Excel works too)"}</span>
          </div>
          <Textarea
            aria-label="CSV text"
            rows={5}
            value={text}
            placeholder={`${templateHeader(kind)}\n…`}
            onChange={(event) => {
              setText(event.target.value);
              setFileName(null);
              setReadError(null);
              setResult(null);
            }}
            className={styles.csvText}
          />

          {problem && (
            <p className={styles.formError} role="alert">
              <CircleAlert aria-hidden="true" />
              {problem}
            </p>
          )}
          {analysis && !problem && (
            <p className={styles.footerNote}>
              {pluralize(analysis.rows.length, "row")} ready · using {analysis.matched.map((column) => column.label).join(", ")}
              {analysis.ignored.length > 0 && ` · ignoring ${analysis.ignored.join(", ")}`}
              {analysis.warnings.map((warning) => ` · ${warning}`)}
            </p>
          )}
          {result && <ImportSummary result={result} />}

          <div className={styles.footer}>
            {(text || result) && (
              <Button variant="ghost" onClick={reset}>
                Clear
              </Button>
            )}
            <Button variant="primary" disabled={!analysis || Boolean(problem)} loading={importCsv.isPending} onClick={handleImport}>
              Import {kind}
            </Button>
          </div>
        </div>

        <div className={styles.subsection}>
          <p className={styles.subheading}>Export to CSV</p>
          <p className={styles.subdescription}>Opens in Excel or Google Sheets. Files are named like shopos-orders-{todayISO()}.csv.</p>
          <div className={styles.exportRow}>
            {EXPORTS.map((item) => (
              <Button
                key={item.kind}
                size="sm"
                icon={<Download aria-hidden="true" />}
                loading={downloadCsv.isPending && downloadCsv.variables === item.kind}
                onClick={() => handleExport(item.kind)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
