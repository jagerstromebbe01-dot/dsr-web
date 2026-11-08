/**
 * Parsing of pasted / uploaded return series. Pure functions (no DOM).
 */

export interface ParsedNumbers {
  values: number[];
  /** Tokens that could not be read as numbers (header row excluded). */
  invalid: string[];
}

/** Pasted text: one number per line, or separated by comma / semicolon / whitespace. */
export function parseReturnsText(text: string): ParsedNumbers {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/)) {
    if (token === "") continue;
    const n = Number(token);
    if (Number.isFinite(n)) values.push(n);
    else invalid.push(token);
  }
  return { values, invalid };
}

export interface CsvTable {
  /** Column names if the first row looks like a header, else null. */
  header: string[] | null;
  rows: string[][];
  columnCount: number;
}

function detectDelimiter(firstLine: string): string {
  const candidates = [";", "\t", ","];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

function isNumeric(s: string): boolean {
  return s.trim() !== "" && Number.isFinite(Number(s.trim()));
}

export function parseCsvTable(text: string): CsvTable {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length === 0) return { header: null, rows: [], columnCount: 0 };
  const delim = detectDelimiter(lines[0]);
  const cells = lines.map((l) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, "")));
  const columnCount = Math.max(...cells.map((r) => r.length));
  // Header = first row has no numeric cell at all, while some later row does.
  const firstHasNumber = cells[0].some(isNumeric);
  const laterHasNumber = cells.slice(1).some((r) => r.some(isNumeric));
  if (!firstHasNumber && laterHasNumber) {
    return { header: cells[0], rows: cells.slice(1), columnCount };
  }
  return { header: null, rows: cells, columnCount };
}

/** Suggests which column holds the returns: a header containing "ret",
 * otherwise the last column that is mostly numeric (dates are usually first). */
export function guessReturnColumn(table: CsvTable): number {
  if (table.header) {
    const idx = table.header.findIndex((h) => /ret/i.test(h));
    if (idx >= 0) return idx;
  }
  for (let c = table.columnCount - 1; c >= 0; c--) {
    const col = table.rows.map((r) => r[c] ?? "");
    const numeric = col.filter(isNumeric).length;
    if (col.length > 0 && numeric / col.length >= 0.8) return c;
  }
  return 0;
}

export function extractColumn(table: CsvTable, column: number): ParsedNumbers {
  const values: number[] = [];
  const invalid: string[] = [];
  for (const row of table.rows) {
    const cell = (row[column] ?? "").trim();
    if (cell === "") continue;
    const n = Number(cell);
    if (Number.isFinite(n)) values.push(n);
    else invalid.push(cell);
  }
  return { values, invalid };
}
