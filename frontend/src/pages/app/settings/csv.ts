// Client-side CSV handling for Settings → Import. The browser reads and checks the file first, so
// the shopkeeper sees which columns will be used (and any problem) before anything is saved.
// Parsing and header matching mirror backend/app/services/io.py: row numbers match the API's
// ImportResult.errors (1-based, header excluded, blank lines counted but skipped).

import type { ImportKind } from "../../../lib/types";

export type Delimiter = "," | "\t" | ";";

/** Same limits as the API. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_CHARS = 5_000_000;
const MAX_FILE_BYTES = 6 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type ParseState = "fieldStart" | "field" | "quoted" | "quoteInQuoted";

/**
 * Splits delimited text into records the way Python's csv.reader (excel dialect, non-strict)
 * does: quoted fields may hold delimiters, quotes ("") and line breaks; \r\n, \n and \r all end a
 * record; an empty line is an empty record; a final line break adds no record.
 */
export function parseDelimited(text: string, delimiter: Delimiter = ","): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let state: ParseState = "fieldStart";
  let recordStarted = false;

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    records.push(record);
    record = [];
    recordStarted = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if ((char === "\n" || char === "\r") && state !== "quoted") {
      if (recordStarted) {
        endField();
        endRecord();
      } else {
        records.push([]);
      }
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      state = "fieldStart";
      continue;
    }
    recordStarted = true;
    switch (state) {
      case "fieldStart":
        if (char === '"') state = "quoted";
        else if (char === delimiter) endField();
        else {
          field += char;
          state = "field";
        }
        break;
      case "field":
        if (char === delimiter) {
          endField();
          state = "fieldStart";
        } else {
          field += char;
        }
        break;
      case "quoted":
        if (char === '"') state = "quoteInQuoted";
        else field += char;
        break;
      case "quoteInQuoted":
        if (char === '"') {
          field += '"';
          state = "quoted";
        } else if (char === delimiter) {
          endField();
          state = "fieldStart";
        } else {
          // Text after a closing quote joins the field, as Python does outside strict mode.
          field += char;
          state = "field";
        }
        break;
    }
  }
  if (recordStarted) {
    endField();
    endRecord();
  }
  return records;
}

/** Comma, tab (text copied from Excel or Google Sheets) or semicolon, judged from the header line. */
export function detectDelimiter(text: string): Delimiter {
  const header = text.replace(/^﻿/, "").split(/\r\n|\n|\r/, 1)[0] ?? "";
  const count = (character: string) => header.split(character).length - 1;
  const commas = count(",");
  const tabs = count("\t");
  const semicolons = count(";");
  if (tabs > 0 && tabs >= commas) return "\t";
  if (semicolons > commas) return ";";
  return ",";
}

function quoteField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Records back to comma-separated text. Every record (blank ones too) keeps its line. */
export function toCsv(records: readonly (readonly string[])[]): string {
  return records.map((record) => record.map(quoteField).join(",")).join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export interface ImportColumn {
  field: string;
  /** Shown in the column guide and the preview. */
  label: string;
  /** Header written in the template. */
  header: string;
  required?: boolean;
  /** What goes in the column, for the guide. */
  help: string;
  example: string;
  /** Header names the importer understands (normalised: lower case, spaces). */
  aliases: readonly string[];
}

export const IMPORT_COLUMNS: Readonly<Record<ImportKind, readonly ImportColumn[]>> = {
  customers: [
    {
      field: "name",
      label: "Name",
      header: "name",
      required: true,
      help: "The customer's name.",
      example: "Rahul Sharma",
      aliases: ["name", "customer", "customer name", "full name"],
    },
    {
      field: "phone",
      label: "Phone",
      header: "phone",
      required: true,
      help: "Mobile number. A customer already in ShopOS with this number is updated, not added twice.",
      example: "98765 43210",
      aliases: ["phone", "mobile", "phone number", "mobile number", "contact", "contact number", "whatsapp"],
    },
    {
      field: "address",
      label: "Address",
      header: "address",
      help: "Used for deliveries.",
      example: "Model Colony, Pune",
      aliases: ["address", "area", "locality"],
    },
    {
      field: "notes",
      label: "Notes",
      header: "notes",
      help: "Anything your staff should know.",
      example: "Prefers evening delivery",
      aliases: ["notes", "note", "remarks"],
    },
    {
      field: "preferred_products",
      label: "Preferred products",
      header: "preferred products",
      help: "Usual items, separated by semicolons.",
      example: "Basmati rice; Tea powder",
      aliases: ["preferred products", "usual items", "favourite products", "favorite products"],
    },
  ],
  products: [
    {
      field: "name",
      label: "Name",
      header: "name",
      required: true,
      help: "Product name. A product already in ShopOS with this name is updated.",
      example: "Basmati rice",
      aliases: ["name", "product", "product name", "item", "item name"],
    },
    {
      field: "category",
      label: "Category",
      header: "category",
      help: "Groups products in lists and reports.",
      example: "Staples",
      aliases: ["category", "group", "department"],
    },
    {
      field: "unit",
      label: "Unit",
      header: "unit",
      help: "pcs, kg, g, l, ml, pack, dozen or box. Pieces when empty.",
      example: "kg",
      aliases: ["unit", "uom", "units"],
    },
    {
      field: "stock_quantity",
      label: "Stock",
      header: "stock_quantity",
      help: "How much you have now.",
      example: "25",
      aliases: ["stock", "stock quantity", "stock qty", "quantity", "qty", "opening stock", "in stock"],
    },
    {
      field: "min_stock_level",
      label: "Low-stock level",
      header: "min_stock_level",
      help: "Warn when stock drops to this.",
      example: "5",
      aliases: ["min stock", "min stock level", "minimum stock", "reorder level", "low stock level"],
    },
    {
      field: "purchase_price",
      label: "Buy price",
      header: "purchase_price",
      help: "What you pay per unit, for profit reports.",
      example: "80",
      aliases: ["purchase price", "cost", "cost price", "buying price"],
    },
    {
      field: "selling_price",
      label: "Sell price",
      header: "selling_price",
      help: "Price per unit. Needed for new products.",
      example: "92",
      aliases: ["selling price", "price", "sale price", "mrp", "rate"],
    },
    {
      field: "sku",
      label: "SKU",
      header: "sku",
      help: "Your own code or barcode, if you use one.",
      example: "BR-1KG",
      aliases: ["sku", "code", "item code", "barcode"],
    },
  ],
};

/** The template's header row (what the import screen shows as the expected header). */
export function templateHeader(kind: ImportKind): string {
  return IMPORT_COLUMNS[kind]
    .filter((column) => column.field !== "preferred_products")
    .map((column) => column.header)
    .join(",");
}

/** A header-only template; the BOM makes Excel read it as UTF-8. */
export function templateCsv(kind: ImportKind): string {
  return `﻿${templateHeader(kind)}\r\n`;
}

/** Header text as the API compares it: no BOM, "_" and "-" as spaces, lower case, single spaces. */
export function normalizeHeader(value: string): string {
  return value
    .replace(/﻿/g, "")
    .replace(/[_-]/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Field → column index. Each header cell maps to at most one field; the first match wins. */
export function mapColumns(header: readonly string[], kind: ImportKind): Record<string, number> {
  const columns = IMPORT_COLUMNS[kind];
  const mapping: Record<string, number> = {};
  header.forEach((raw, index) => {
    const key = normalizeHeader(raw);
    for (const column of columns) {
      if (column.field in mapping) continue;
      if (column.aliases.includes(key) || key === column.field.replace(/_/g, " ")) {
        mapping[column.field] = index;
        break;
      }
    }
  });
  return mapping;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export interface CsvRow {
  /** Row number as the API reports it (1 = first line under the header). */
  number: number;
  cells: string[];
}

export interface CsvAnalysis {
  delimiter: Delimiter;
  header: string[];
  /** Non-blank data rows. */
  rows: CsvRow[];
  /** Field → column index for the columns found. */
  mapping: Record<string, number>;
  /** Columns the importer understands, in guide order, that are present. */
  matched: ImportColumn[];
  /** Header names the importer will ignore. */
  ignored: string[];
  /** Stops the import (nothing is sent). */
  problem: string | null;
  /** Worth knowing, but the import can go ahead. */
  warnings: string[];
  /** What is sent to the API: the original text, or tab/semicolon text converted to CSV. */
  uploadText: string;
}

function isBlank(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}

function missingColumnsProblem(kind: ImportKind, mapping: Record<string, number>): string | null {
  if (kind === "customers") {
    const hasName = "name" in mapping;
    const hasPhone = "phone" in mapping;
    if (hasName && hasPhone) return null;
    if (!hasName && !hasPhone) return "Add a name column and a phone column. ShopOS needs both for every customer.";
    return hasName ? "Add a phone column. ShopOS matches customers by phone number." : "Add a name column for the customer's name.";
  }
  return "name" in mapping ? null : "Add a name column for the product name.";
}

/** Reads CSV (or pasted tab-separated) text and checks it before import. */
export function analyzeCsv(text: string, kind: ImportKind): CsvAnalysis {
  const body = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(body);
  const records = body.trim() ? parseDelimited(body, delimiter) : [];
  const header = records[0] ?? [];
  const rows: CsvRow[] = records
    .slice(1)
    .map((cells, index) => ({ number: index + 1, cells }))
    .filter((row) => !isBlank(row.cells));
  const mapping = mapColumns(header, kind);
  const matched = IMPORT_COLUMNS[kind].filter((column) => column.field in mapping);
  const usedIndexes = new Set(Object.values(mapping));
  const ignored = header
    .map((name, index) => ({ name: name.replace(/^﻿/, "").trim(), index }))
    .filter((entry) => entry.name !== "" && !usedIndexes.has(entry.index))
    .map((entry) => entry.name);
  // The API splits lines on \n only, so old Mac files (\r line ends) and tab or semicolon text are
  // rewritten as standard CSV; anything else is sent exactly as the shopkeeper gave it.
  const hasLoneCarriageReturn = /\r(?!\n)/.test(body);
  const uploadText = delimiter === "," && !hasLoneCarriageReturn ? text : toCsv(records);

  let problem: string | null = null;
  if (!body.trim()) {
    problem = "This file is empty.";
  } else if (isBlank(header)) {
    problem = "The first line should be the header row with column names, like the template.";
  } else {
    problem = missingColumnsProblem(kind, mapping);
  }
  if (!problem && rows.length === 0) problem = "There are no rows under the header to import.";
  if (!problem && rows.length > MAX_IMPORT_ROWS) {
    problem = `This file has ${rows.length.toLocaleString("en-IN")} rows. Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} at a time: split it into smaller files.`;
  }
  if (!problem && uploadText.length > MAX_IMPORT_CHARS) {
    problem = `This file is too large. Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows at a time.`;
  }

  const warnings: string[] = [];
  if (!problem && kind === "products" && !("selling_price" in mapping)) {
    warnings.push("There's no selling price column, so only products already in ShopOS can be updated.");
  }

  return { delimiter, header, rows, mapping, matched, ignored, problem, warnings, uploadText };
}

/** The trimmed value of a field in a row ("" when the column is missing). */
export function cellOf(row: CsvRow | undefined, analysis: Pick<CsvAnalysis, "mapping">, field: string): string {
  const index = analysis.mapping[field];
  if (row === undefined || index === undefined) return "";
  return (row.cells[index] ?? "").trim();
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

/** A reason not to read a picked file at all, or null. */
export function fileProblem(file: Pick<File, "name" | "size">): string | null {
  if (/\.(xlsx|xlsm|xlsb|xls|ods|numbers)$/i.test(file.name)) {
    return "This is a spreadsheet file, not a CSV. In Excel choose File, Save As, then CSV UTF-8, and import that file.";
  }
  if (file.size === 0) return "This file is empty.";
  if (file.size > MAX_FILE_BYTES) return `This file is too large. Import up to ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows at a time.`;
  return null;
}

/**
 * Bytes to text: UTF-8 (with or without BOM), UTF-16 with a BOM ("Unicode text" from Excel),
 * otherwise Windows-1252, which is what older Excel versions save as "CSV".
 */
export function decodeCsvBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Reads a picked or dropped file in the browser (FileReader) and decodes it as text. */
export function readCsvFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (result instanceof ArrayBuffer) resolve(decodeCsvBytes(new Uint8Array(result)));
      else reject(new Error("This file couldn't be read. Try saving it again as CSV."));
    };
    reader.onerror = () => reject(new Error("This file couldn't be read. Try saving it again as CSV."));
    reader.readAsArrayBuffer(file);
  });
}
