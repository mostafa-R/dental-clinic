const escapeCell = (value) => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

export const toCsv = (rows, headers) => {
  if (!rows || rows.length === 0) return "";
  const headerLine = headers.map((h) => escapeCell(h.label)).join(",");
  const bodyLines = rows.map((row) =>
    headers.map((h) => escapeCell(h.getValue(row))).join(","),
  );
  return [headerLine, ...bodyLines].join("\r\n");
};

export function downloadCsv({ filename, rows, headers }) {
  if (!rows || rows.length === 0) return;
  const csv = toCsv(rows, headers);
  const blob = new Blob([`\uFEFF${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}