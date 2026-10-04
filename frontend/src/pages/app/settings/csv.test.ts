import { describe, expect, it } from "vitest";
import {
  analyzeCsv,
  cellOf,
  decodeCsvBytes,
  detectDelimiter,
  fileProblem,
  mapColumns,
  normalizeHeader,
  parseDelimited,
  templateCsv,
  templateHeader,
  toCsv,
} from "./csv";

describe("parseDelimited (matches Python's csv.reader)", () => {
  it("splits simple rows and ignores a final line break", () => {
    expect(parseDelimited("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles quotes, escaped quotes and commas inside quotes", () => {
    expect(parseDelimited('name,address\n"Sharma, Rahul","Shop ""4"", Lane 3"\n')).toEqual([
      ["name", "address"],
      ["Sharma, Rahul", 'Shop "4", Lane 3'],
    ]);
  });

  it("keeps line breaks inside quoted fields", () => {
    expect(parseDelimited('a,b\r\n"line 1\r\nline 2",x\r\n')).toEqual([
      ["a", "b"],
      ["line 1\r\nline 2", "x"],
    ]);
  });

  it("treats \\r\\n, \\n and \\r as record ends and keeps blank lines as empty records", () => {
    expect(parseDelimited("a\r\n\r\nb\rc\n\nd")).toEqual([["a"], [], ["b"], ["c"], [], ["d"]]);
  });

  it("keeps empty trailing fields", () => {
    expect(parseDelimited("a,b,\n,,\n")).toEqual([
      ["a", "b", ""],
      ["", "", ""],
    ]);
  });

  it("joins text after a closing quote, like non-strict Python", () => {
    expect(parseDelimited('"abc"def,g\n')).toEqual([["abcdef", "g"]]);
  });

  it("closes an unterminated quote at the end of the text", () => {
    expect(parseDelimited('a,"unfinished')).toEqual([["a", "unfinished"]]);
  });

  it("parses tab-separated text", () => {
    expect(parseDelimited("name\tphone\nRahul\t98765 43210\n", "\t")).toEqual([
      ["name", "phone"],
      ["Rahul", "98765 43210"],
    ]);
  });
});

describe("delimiters and writing", () => {
  it("detects commas, tabs and semicolons from the header", () => {
    expect(detectDelimiter("name,phone\nRahul,1")).toBe(",");
    expect(detectDelimiter("name\tphone\tnotes\nRahul\t1\ta, b")).toBe("\t");
    expect(detectDelimiter("name;phone\nRahul;1")).toBe(";");
    expect(detectDelimiter("﻿name\tphone")).toBe("\t");
    expect(detectDelimiter("name")).toBe(",");
  });

  it("round-trips through toCsv", () => {
    const records = [["name", "notes"], [], ["Rahul", 'Says "hello", then leaves']];
    expect(toCsv(records)).toBe('name,notes\r\n\r\nRahul,"Says ""hello"", then leaves"\r\n');
    expect(parseDelimited(toCsv(records))).toEqual(records);
  });
});

describe("headers", () => {
  it("normalises like the API", () => {
    expect(normalizeHeader("﻿Stock_Quantity")).toBe("stock quantity");
    expect(normalizeHeader("  Mobile-Number ")).toBe("mobile number");
    expect(normalizeHeader("Phone   number")).toBe("phone number");
  });

  it("maps aliases, first match wins", () => {
    expect(mapColumns(["Customer Name", "Mobile", "Area", "Name"], "customers")).toEqual({ name: 0, phone: 1, address: 2 });
    expect(mapColumns(["Item", "MRP", "Cost Price", "Qty", "UOM", "Barcode"], "products")).toEqual({
      name: 0,
      selling_price: 1,
      purchase_price: 2,
      stock_quantity: 3,
      unit: 4,
      sku: 5,
    });
  });

  it("writes the documented template headers", () => {
    expect(templateHeader("customers")).toBe("name,phone,address,notes");
    expect(templateHeader("products")).toBe(
      "name,category,unit,stock_quantity,min_stock_level,purchase_price,selling_price,sku",
    );
    expect(templateCsv("customers").startsWith("﻿name,phone")).toBe(true);
    expect(mapColumns(templateHeader("products").split(","), "products")).toEqual({
      name: 0,
      category: 1,
      unit: 2,
      stock_quantity: 3,
      min_stock_level: 4,
      purchase_price: 5,
      selling_price: 6,
      sku: 7,
    });
  });
});

describe("analyzeCsv", () => {
  it("numbers rows like the API (blank lines counted, then skipped)", () => {
    const analysis = analyzeCsv("name,phone,GSTIN\nRahul,9876543210,X\n\nMeera,9876500004,\n", "customers");
    expect(analysis.problem).toBeNull();
    expect(analysis.rows.map((row) => row.number)).toEqual([1, 3]);
    expect(analysis.ignored).toEqual(["GSTIN"]);
    expect(analysis.matched.map((column) => column.field)).toEqual(["name", "phone"]);
    expect(cellOf(analysis.rows[1], analysis, "name")).toBe("Meera");
    expect(cellOf(analysis.rows[1], analysis, "address")).toBe("");
    expect(analysis.uploadText).toBe("name,phone,GSTIN\nRahul,9876543210,X\n\nMeera,9876500004,\n");
  });

  it("converts pasted tab-separated text to CSV for upload", () => {
    const analysis = analyzeCsv("name\tphone\tnotes\nRahul\t98765 43210\tPays, weekly\n", "customers");
    expect(analysis.delimiter).toBe("\t");
    expect(analysis.uploadText).toBe('name,phone,notes\r\nRahul,98765 43210,"Pays, weekly"\r\n');
  });

  it("rewrites old Mac line endings, which the API can't read", () => {
    const analysis = analyzeCsv("name,phone\rRahul,9876543210\r\rMeera,9876500004\r", "customers");
    expect(analysis.rows.map((row) => row.number)).toEqual([1, 3]);
    expect(analysis.uploadText).toBe("name,phone\r\nRahul,9876543210\r\n\r\nMeera,9876500004\r\n");
  });

  it("explains missing required columns", () => {
    expect(analyzeCsv("name,address\nRahul,Pune\n", "customers").problem).toBe(
      "Add a phone column. ShopOS matches customers by phone number.",
    );
    expect(analyzeCsv("phone\n9876543210\n", "customers").problem).toBe("Add a name column for the customer's name.");
    expect(analyzeCsv("email\nx@y.z\n", "customers").problem).toBe(
      "Add a name column and a phone column. ShopOS needs both for every customer.",
    );
    expect(analyzeCsv("sku,price\nA,10\n", "products").problem).toBe("Add a name column for the product name.");
  });

  it("flags empty files, missing headers and files with no rows", () => {
    expect(analyzeCsv("", "customers").problem).toBe("This file is empty.");
    expect(analyzeCsv("﻿  \n", "customers").problem).toBe("This file is empty.");
    expect(analyzeCsv("\nname,phone\n", "customers").problem).toBe(
      "The first line should be the header row with column names, like the template.",
    );
    expect(analyzeCsv("name,phone\n\n", "customers").problem).toBe("There are no rows under the header to import.");
  });

  it("enforces the row limit", () => {
    const text = `name,phone\n${Array.from({ length: 5001 }, (_, index) => `C${index},98765${String(index).padStart(5, "0")}`).join("\n")}`;
    expect(analyzeCsv(text, "customers").problem).toBe("This file has 5,001 rows. Import up to 5,000 at a time: split it into smaller files.");
  });

  it("warns when products have no selling price column", () => {
    const analysis = analyzeCsv("name,stock\nSugar,10\n", "products");
    expect(analysis.problem).toBeNull();
    expect(analysis.warnings).toEqual(["There's no selling price column, so only products already in ShopOS can be updated."]);
  });
});

describe("files", () => {
  it("rejects spreadsheets, empty and huge files", () => {
    expect(fileProblem({ name: "customers.xlsx", size: 2048 })).toMatch(/spreadsheet file/);
    expect(fileProblem({ name: "customers.csv", size: 0 })).toBe("This file is empty.");
    expect(fileProblem({ name: "customers.csv", size: 7 * 1024 * 1024 })).toMatch(/too large/);
    expect(fileProblem({ name: "customers.csv", size: 2048 })).toBeNull();
  });

  it("decodes UTF-8 (with BOM), UTF-16 and Windows-1252", () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("name\n₹ Shop")]);
    expect(decodeCsvBytes(utf8)).toBe("name\n₹ Shop");
    const utf16 = new Uint8Array([0xff, 0xfe, 0x6e, 0x00, 0x61, 0x00]);
    expect(decodeCsvBytes(utf16)).toBe("na");
    // "Café" saved by older Excel: é is 0xE9, which isn't valid UTF-8 on its own.
    expect(decodeCsvBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9]))).toBe("Café");
  });
});
