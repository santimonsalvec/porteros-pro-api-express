import { describe, expect, it } from 'vitest';
import { toCsv } from '../../../../src/domain/common/csv.js';

const BOM = '﻿';

describe('toCsv', () => {
  const columns = ['fecha', 'portero', 'monto'] as const;

  it('starts with a BOM, separates with ";" and ends lines with CRLF', () => {
    const csv = toCsv(columns, [{ fecha: '2026-10-13 09:05', portero: 'Juan Pérez', monto: 20000 }]);
    expect(csv).toBe(`${BOM}fecha;portero;monto\r\n2026-10-13 09:05;Juan Pérez;20000\r\n`);
  });

  it('quotes a value with ";", quotes or a line break, doubling inner quotes', () => {
    const csv = toCsv(columns, [{ fecha: 'a;b', portero: 'Ana "La Muralla"', monto: 'uno\ndos' }]);
    expect(csv.split('\r\n')[1]).toBe('"a;b";"Ana ""La Muralla""";"uno\ndos"');
  });

  it('neutralizes text that a spreadsheet would run as a formula, but not negative numbers', () => {
    const rows = [
      { fecha: '=HYPERLINK("x")', portero: '+57', monto: -8330 },
      { fecha: '@SUM(A1)', portero: '-x', monto: '\tTab' },
      { fecha: '\rret', portero: 'ok', monto: 0 },
    ];
    const lines = toCsv(columns, rows).split('\r\n');
    expect(lines[1]).toBe(`"'=HYPERLINK(""x"")";'+57;-8330`);
    expect(lines[2]).toBe(`'@SUM(A1);'-x;'\tTab`);
    expect(lines[3]).toBe(`"'\rret";ok;0`);
  });

  it('writes null and undefined as empty cells and keeps accents', () => {
    expect(toCsv(columns, [{ fecha: null, portero: 'Ñandú Ríos', monto: undefined }]).split('\r\n')[1]).toBe(';Ñandú Ríos;');
  });

  it('writes only the header when there are no rows', () => {
    expect(toCsv(columns, [])).toBe(`${BOM}fecha;portero;monto\r\n`);
  });
});
