/** A cell: text, a whole number, or nothing. */
export type CsvValue = string | number | null | undefined;

const BOM = '﻿';
const SEPARATOR = ';';
const LINE_END = '\r\n';
/** What a spreadsheet would run as a formula at the start of a text cell (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[";\r\n]/;

/**
 * A CSV for the accounting exports (admin spec 007, research §7) that Excel in es-CO opens as is:
 * UTF-8 with a BOM (accents), ";" between cells (the comma is its decimal mark) and CRLF. Text that
 * starts like a formula is prefixed with `'`; numbers are written as they are, so −8330 stays a number.
 */
export function toCsv<Column extends string>(columns: readonly Column[], rows: readonly Partial<Record<Column, CsvValue>>[]): string {
  const lines = [columns.map(cell), ...rows.map((row) => columns.map((column) => cell(row[column])))];
  return BOM + lines.map((line) => line.join(SEPARATOR) + LINE_END).join('');
}

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
