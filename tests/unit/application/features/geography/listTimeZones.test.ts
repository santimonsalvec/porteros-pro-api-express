import { describe, expect, it } from 'vitest';
import { isSupportedTimeZone, supportedTimeZones } from '../../../../../src/application/features/geography/common/timeZones.js';
import { ListTimeZonesQuery } from '../../../../../src/application/features/geography/queries/listTimeZones/listTimeZonesQuery.js';
import { ListTimeZonesQueryHandler } from '../../../../../src/application/features/geography/queries/listTimeZones/listTimeZonesQueryHandler.js';
import { isValidTimeZone } from '../../../../../src/application/features/goalkeeperRequests/common/zonedTime.js';

describe('time zones of the admin (research §12)', () => {
  it("lists the runtime's IANA zones, sorted", async () => {
    const { timeZones } = await new ListTimeZonesQueryHandler().handle(new ListTimeZonesQuery());

    expect(timeZones).toEqual([...Intl.supportedValuesOf('timeZone')].sort());
    expect(timeZones).toContain('America/Bogota');
    expect(supportedTimeZones()).toEqual(timeZones);
  });

  it('accepts only canonical names to save, though the quote still reads aliases', () => {
    expect(isSupportedTimeZone('America/Bogota')).toBe(true);
    expect(isSupportedTimeZone('US/Eastern')).toBe(false);
    expect(isValidTimeZone('US/Eastern')).toBe(true);
    expect(isSupportedTimeZone('Mars/Olympus')).toBe(false);
  });
});
