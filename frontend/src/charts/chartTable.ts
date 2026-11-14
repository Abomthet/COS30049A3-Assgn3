// The table behind a chart: what the "View as table" switch shows, what a screen reader reads
// and what "Download CSV" writes. A chart builds one of these from the same rows it plots,
// so the picture and the table cannot disagree.

export interface TableCell {
  text: string;
  /** A second, smaller line under the text (a feature's description, a role in words). */
  sub?: string;
  /** Makes the cell a link, shown only while the table is visible (a hidden link cannot be focused sensibly). */
  href?: string;
}

export interface TableColumn {
  label: string;
  numeric?: boolean;
}

export interface ChartTable {
  columns: TableColumn[];
  /** Each row's first cell is its row header. */
  rows: TableCell[][];
}

const quote = (text: string) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

/** RFC 4180 CSV: the header row, then one line per row, with the text of each cell (never its sub line). */
export function tableToCsv(table: ChartTable): string {
  const lines = [table.columns.map((c) => c.label), ...table.rows.map((row) => row.map((cell) => cell.text))];
  return lines.map((line) => line.map(quote).join(',')).join('\r\n') + '\r\n';
}

/** A file name safe on every system: letters, digits, dots and hyphens (case kept, since addresses are case-sensitive), parts joined by underscores. */
export function fileStem(parts: string[]): string {
  return parts.map((p) => p.replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '')).filter(Boolean).join('_');
}

/** Hands text to the browser as a file download. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
