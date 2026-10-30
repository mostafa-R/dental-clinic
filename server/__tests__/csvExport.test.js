import { describe, expect, it, vi } from 'vitest';

/**
 * Regression coverage for the CSV export path (audit M6, Report Builder v1).
 *
 * CSV files are opened in Excel/LibreOffice, which execute a leading `=`/`+`/
 * `-`/`@` cell as a FORMULA. The data exported here is user-controlled prose
 * (patient names, note fields), so a malicious or merely too-clever name turned
 * the accountant's spreadsheet into a code execution surface. The utility
 * neutralizes such cells with a leading apostrophe — the property pinned in
 * `escapes formula-lookalike cells`, plus the RFC-4180 quoting rules and the
 * response security headers.
 */

const { toCsv } = await import('../utils/csv.js');

describe('toCsv serializes safely', () => {
  it('quotes and escapes RFC-4180 special characters', () => {
    const csv = toCsv(
      [
        { a: 'has,comma', b: 'has"quote', c: 'has\nnewline' },
      ],
      [
        { label: 'A', getValue: (r) => r.a },
        { label: 'B', getValue: (r) => r.b },
        { label: 'C', getValue: (r) => r.c },
      ],
    );
    expect(csv).toBe('\uFEFFA,B,C\r\n"has,comma","has""quote","has\nnewline"\r\n');
  });

  it('escapes formula-lookalike cells so spreadsheets cannot execute them', () => {
    const dangerous = ['=HYPERLINK("http://evil","click")', '+SUM(1,2)', '@cmd', '-2+3', '\tTABFORMULA'];
    const csv = toCsv(
      [{ values: dangerous }],
      dangerous.map((_, i) => ({ label: `C${i}`, getValue: (r) => r.values[i] })),
    );
    const [row] = csv.split('\r\n').slice(1);

    // Minimal RFC-4180 cell parser: strips quoting and undoes doubled quotes,
    // so the assertions below look at the DECODED payload a spreadsheet would
    // receive.
    const parseRow = (line) => {
      const cells = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
          } else cur += ch;
        } else if (ch === '"') inQuotes = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      return cells;
    };

    const cells = parseRow(row);
    expect(cells).toEqual(dangerous.map((value) => `'${value}`));
  });

  it('leaves ordinary text and numbers untouched', () => {
    const csv = toCsv(
      [{ name: 'Ahmed Hassan', total: 1200.5 }],
      [
        { label: 'Name', getValue: (r) => r.name },
        { label: 'Total', getValue: (r) => r.total },
      ],
    );
    expect(csv).toBe('\uFEFFName,Total\r\nAhmed Hassan,1200.5\r\n');
  });

  it('renders null and undefined as empty cells', () => {
    const csv = toCsv(
      [{ a: null, b: undefined, c: 0, d: '' }],
      [
        { label: 'A', getValue: (r) => r.a },
        { label: 'B', getValue: (r) => r.b },
        { label: 'C', getValue: (r) => r.c },
        { label: 'D', getValue: (r) => r.d },
      ],
    );
    expect(csv).toBe('\uFEFFA,B,C,D\r\n,,0,\r\n');
  });
});

describe('sendCsv response hardening', () => {
  it('sends attachment disposition with a sanitized filename and nosniff', async () => {
    const { sendCsv } = await import('../utils/csv.js');
    const headers = new Map();
    const written = [];
    const res = {
      setHeader: (k, v) => headers.set(k, v),
      flushHeaders: undefined,
      write: (chunk) => written.push(chunk),
      end: vi.fn(),
    };

    sendCsv(res, {
      filename: 'revenue report "../etc.csv',
      headers: [{ label: 'X', getValue: () => 1 }],
      rows: [{ }],
    });

    expect(headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(headers.get('Content-Disposition')).toBe('attachment; filename="revenue_report_.._etc.csv"');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(written[0]).toContain('\uFEFF');
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
