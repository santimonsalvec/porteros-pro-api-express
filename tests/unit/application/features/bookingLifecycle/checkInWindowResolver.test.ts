import { describe, expect, it, vi } from 'vitest';
import { createCheckInWindowResolver } from '../../../../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeMarketRepository } from '../../../../fakes/fakeMarketRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { seedOperatingBalanceWorld } from '../../../../fixtures/operatingBalanceFixtures.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

function setup(checkInWindow?: Record<string, number>) {
  const marketRepository = new FakeMarketRepository();
  seedOperatingBalanceWorld({ marketRepository, countryRepository: new FakeCountryRepository() });
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', checkInWindow: checkInWindow ?? null }));
  const warnings: Record<string, unknown>[] = [];
  const logger = { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) };
  const resolve = createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger });
  return { resolve, warnings, marketRepository };
}

const inCali = buildRequest('r-1', new Date('2026-09-21T22:00:00.000Z'), { marketId: 'city-cali' });

describe('check-in window resolver (feature 020)', () => {
  it("uses the country's values, without a warning when complete", async () => {
    const { resolve, warnings } = setup({ opensMinutesBefore: 20, closesMinutesAfter: 10 });

    expect(await resolve(inCali)).toEqual({ opensMinutesBefore: 20, closesMinutesAfter: 10 });
    expect(warnings).toEqual([]);
  });

  it('defaults what is missing, with a warning', async () => {
    const { resolve, warnings } = setup({ closesMinutesAfter: 10 });

    expect(await resolve(inCali)).toEqual({ opensMinutesBefore: 30, closesMinutesAfter: 10 });
    expect(warnings).toEqual([expect.objectContaining({ outcome: 'check_in_window_defaulted', defaulted: ['opensMinutesBefore'] })]);
  });

  it('defaults everything for an unknown country, and reads each city once', async () => {
    const { resolve, marketRepository } = setup({ closesMinutesAfter: 10 });
    const getById = vi.spyOn(marketRepository, 'getById');
    const orphan = buildRequest('r-2', new Date('2026-09-21T22:00:00.000Z'), { marketId: 'city-orphan' });

    expect(await resolve(orphan)).toEqual({ opensMinutesBefore: 30, closesMinutesAfter: 15 });
    await resolve(orphan);
    expect(getById).toHaveBeenCalledTimes(1);
  });
});

describe('check-in window resolver by market (spec 031, FR-014)', () => {
  it("lets the market's values win over the country's, field by field", async () => {
    const { resolve, warnings, bookingSettingsRepository } = setupWith({ opensMinutesBefore: 20, closesMinutesAfter: 10 });
    bookingSettingsRepository.seed(new BookingSettings({ id: 's-cali', scope: 'market', refId: 'city-cali', checkInWindow: { opensMinutesBefore: 45 } }));

    expect(await resolve(inCali)).toEqual({ opensMinutesBefore: 45, closesMinutesAfter: 10 });
    expect(warnings).toEqual([]);
  });

  it('uses the platform values when neither the market nor the country sets them', async () => {
    const { resolve } = setupWith(undefined);
    expect(await resolve(inCali)).toEqual({ opensMinutesBefore: 30, closesMinutesAfter: 15 });
  });
});

function setupWith(checkInWindow?: Record<string, number>) {
  const marketRepository = new FakeMarketRepository();
  seedOperatingBalanceWorld({ marketRepository, countryRepository: new FakeCountryRepository() });
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', checkInWindow: checkInWindow ?? null }));
  const warnings: Record<string, unknown>[] = [];
  const logger = { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) };
  return { resolve: createCheckInWindowResolver({ marketRepository, bookingSettingsRepository, logger }), warnings, bookingSettingsRepository };
}
