import { describe, expect, it, vi } from 'vitest';
import { createCheckInWindowResolver } from '../../../../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { seedWalletWorld } from '../../../../fixtures/walletFixtures.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

function setup(checkInWindow?: Record<string, number>) {
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  seedWalletWorld({ cityRepository, regionRepository, countryRepository: new FakeCountryRepository() });
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', checkInWindow: checkInWindow ?? null }));
  const warnings: Record<string, unknown>[] = [];
  const logger = { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) };
  const resolve = createCheckInWindowResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger });
  return { resolve, warnings, cityRepository };
}

const inCali = buildRequest('r-1', new Date('2026-09-21T22:00:00.000Z'), { cityId: 'city-cali' });

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
    const { resolve, cityRepository } = setup({ closesMinutesAfter: 10 });
    const getById = vi.spyOn(cityRepository, 'getById');
    const orphan = buildRequest('r-2', new Date('2026-09-21T22:00:00.000Z'), { cityId: 'city-orphan' });

    expect(await resolve(orphan)).toEqual({ opensMinutesBefore: 30, closesMinutesAfter: 15 });
    await resolve(orphan);
    expect(getById).toHaveBeenCalledTimes(1);
  });
});
