// Small browser file helpers: saving generated files and reading picked files.

/** Saves a Blob as a download with the given file name. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves text (e.g. a CSV template generated in the browser) as a download. */
export function saveTextFile(filename: string, content: string, type = "text/csv;charset=utf-8"): void {
  saveBlob(new Blob([content], { type }), filename);
}

/** Reads a picked file (e.g. from <input type="file" accept=".csv">) as UTF-8 text. */
export function readFileAsText(file: File): Promise<string> {
  return file.text();
}
