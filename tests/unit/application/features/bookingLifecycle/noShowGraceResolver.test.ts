import { describe, expect, it } from 'vitest';
import { createNoShowGraceResolver } from '../../../../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { seedWalletWorld } from '../../../../fixtures/walletFixtures.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

function setup(noShowGraceMinutes?: number) {
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  seedWalletWorld({ cityRepository, regionRepository, countryRepository: new FakeCountryRepository() });
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  bookingSettingsRepository.seed(new BookingSettings({ id: 's', scope: 'country', refId: 'country-co', noShowGraceMinutes: noShowGraceMinutes ?? null }));
  const warnings: Record<string, unknown>[] = [];
  const logger = { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) };
  return { resolve: createNoShowGraceResolver({ cityRepository, regionRepository, bookingSettingsRepository, logger }), warnings };
}

const request = buildRequest('r-1', new Date('2026-09-21T22:00:00.000Z'), { cityId: 'city-cali' });

describe('no-show grace resolver (feature 021)', () => {
  it("uses the country's value, or 60 with a warning", async () => {
    expect(await setup(30).resolve(request)).toBe(30);
    const unset = setup();
    expect(await unset.resolve(request)).toBe(60);
    expect(unset.warnings).toEqual([expect.objectContaining({ outcome: 'no_show_grace_defaulted' })]);
  });
});
