import { describe, expect, it } from 'vitest';
import { dashboardWindows } from '../../../../../src/application/features/dashboard/common/windows.js';

const iso = (date: Date) => date.toISOString();

describe('dashboardWindows (admin spec 008, FR-003)', () => {
  it("gives today's and this week's instants (Monday to Monday) in Bogotá", () => {
    // Tuesday 13 Oct 2026, 09:00 in Bogotá.
    const windows = dashboardWindows('America/Bogota', new Date('2026-10-13T14:00:00.000Z'));
    expect(iso(windows.today.from)).toBe('2026-10-13T05:00:00.000Z');
    expect(iso(windows.today.to)).toBe('2026-10-14T05:00:00.000Z');
    expect(iso(windows.week.from)).toBe('2026-10-12T05:00:00.000Z');
    expect(iso(windows.week.to)).toBe('2026-10-19T05:00:00.000Z');
    expect(windows.days).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  });

  it('reads the local day, not the UTC one, at both ends of the night', () => {
    // 23:59 Monday in Bogotá is already Tuesday in UTC.
    const late = dashboardWindows('America/Bogota', new Date('2026-10-13T04:59:00.000Z'));
    expect(iso(late.today.from)).toBe('2026-10-12T05:00:00.000Z');
    // 00:00 Tuesday in Bogotá.
    const early = dashboardWindows('America/Bogota', new Date('2026-10-13T05:00:00.000Z'));
    expect(iso(early.today.from)).toBe('2026-10-13T05:00:00.000Z');
  });

  it('starts the week on Monday on a Sunday and on a Monday', () => {
    const sunday = dashboardWindows('America/Bogota', new Date('2026-10-18T20:00:00.000Z'));
    expect(iso(sunday.week.from)).toBe('2026-10-12T05:00:00.000Z');
    const monday = dashboardWindows('America/Bogota', new Date('2026-10-19T20:00:00.000Z'));
    expect(iso(monday.week.from)).toBe('2026-10-19T05:00:00.000Z');
  });

  it('crosses months and years', () => {
    // Thursday 31 Dec 2026.
    const windows = dashboardWindows('America/Bogota', new Date('2026-12-31T15:00:00.000Z'));
    expect(iso(windows.today.to)).toBe('2027-01-01T05:00:00.000Z');
    expect(windows.days[0]).toBe('2026-12-28');
    expect(windows.days[6]).toBe('2027-01-03');
    expect(iso(windows.week.to)).toBe('2027-01-04T05:00:00.000Z');
  });

  it('keeps whole local days across a daylight-saving change', () => {
    // Chile goes from −04 to −03 on Sunday 6 Sep 2026 at 00:00 (clocks jump to 01:00).
    const windows = dashboardWindows('America/Santiago', new Date('2026-09-06T15:00:00.000Z'));
    expect(windows.days[6]).toBe('2026-09-06');
    expect(iso(windows.today.from)).toBe('2026-09-06T04:00:00.000Z');
    expect(iso(windows.today.to)).toBe('2026-09-07T03:00:00.000Z');
    expect(iso(windows.week.from)).toBe('2026-08-31T04:00:00.000Z');
  });
});
