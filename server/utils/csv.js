/**
 * RFC-4180 CSV building + hardened download response (audit M6, Report
 * Builder v1). Exports reuse the same permission + branch filters as the
 * corresponding list endpoints — a CSV is never a way around scope.
 *
 * Two details matter for safety and correctness:
 *
 *  - Spreadsheet formula injection: a cell whose text begins with `=`, `+`,
 *    `-`, `@` or a tab/CR is executed as a formula by Excel/LibreOffice when
 *    the file opens (classic attack: a patient named `=HYPERLINK(...)` or a
 *    note field crafted by one staff member that runs code on the accountant's
 *    machine). Such cells get a leading `'`, which spreadsheets render as a
 *    literal string — the same neutralization Google Sheets applies.
 *  - The response always carries `Content-Disposition: attachment` with an
 *    ASCII-safe filename and `X-Content-Type-Options: nosniff`, so the CSV is
 *    downloaded rather than rendered in the browser context.
 */

const FORMULA_PREFIXES = /^[=+\-@\t\r]/;

function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (FORMULA_PREFIXES.test(str)) {
    str = `'${str}`;
  }
  if (/[",\n\r]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialize rows to CSV text. `headers` is `[{ label, getValue(row) }]`,
 * the same shape the AdminDashboard's local exporter already uses, so server
 * and client exports stay byte-comparable in structure.
 */
export function toCsv(rows, headers) {
  const lines = [headers.map((h) => escapeCell(h.label))];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(h.getValue(row))));
  }
  // CRLF per RFC-4180; the BOM keeps Excel from misreading Arabic as CP-1256.
  return `\uFEFF${lines.map((l) => l.join(',')).join('\r\n')}\r\n`;
}

/**
 * Send `rows` as a downloadable CSV, serializing on the fly (constant memory
 * for large exports). Call it from a controller AFTER the permission,
 * branch-scope and query-validation middleware has run.
 */
export function sendCsv(res, { filename, headers, rows }) {
  const safeName = String(filename).replace(/[^\w.-]+/g, '_');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders?.();
  res.write(toCsv(rows, headers));
  res.end();
}
