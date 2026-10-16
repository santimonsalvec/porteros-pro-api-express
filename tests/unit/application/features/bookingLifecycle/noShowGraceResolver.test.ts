import { describe, expect, it } from 'vitest';
import { createNoShowGraceResolver } from '../../../../../src/application/features/bookingLifecycle/common/checkInWindowResolver.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeMarketRepository, testMarket } from '../../../../fakes/fakeMarketRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { seedOperatingBalanceWorld } from '../../../../fixtures/operatingBalanceFixtures.js';
import { buildRequest } from '../../../../fixtures/quoteFixtures.js';

function setup(noShowGraceMinutes?: number) {
  const marketRepository = new FakeMarketRepository();
  seedOperatingBalanceWorld({ marketRepository, countryRepository: new FakeCountryRepository() });
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  bookingSettingsRepository.seed(new BookingSettings({ id: 's', scope: 'country', refId: 'country-co', noShowGraceMinutes: noShowGraceMinutes ?? null }));
  const warnings: Record<string, unknown>[] = [];
  const logger = { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) };
  return { resolve: createNoShowGraceResolver({ marketRepository, bookingSettingsRepository, logger }), warnings };
}

const request = buildRequest('r-1', new Date('2026-09-21T22:00:00.000Z'), { marketId: 'city-cali' });

describe('no-show grace resolver (feature 021)', () => {
  it("uses the country's value, or 60 with a warning", async () => {
    expect(await setup(30).resolve(request)).toBe(30);
    const unset = setup();
    expect(await unset.resolve(request)).toBe(60);
    expect(unset.warnings).toEqual([expect.objectContaining({ outcome: 'no_show_grace_defaulted' })]);
  });
});

describe('no-show grace resolver by market (spec 031, FR-014)', () => {
  it("lets the market's value win over the country's, and falls back to the platform's", async () => {
    const marketRepository = new FakeMarketRepository();
    seedOperatingBalanceWorld({ marketRepository, countryRepository: new FakeCountryRepository() });
    const bookingSettingsRepository = new FakeBookingSettingsRepository();
    bookingSettingsRepository.seed(new BookingSettings({ id: 's', scope: 'country', refId: 'country-co', noShowGraceMinutes: 30 }));
    marketRepository.seed(testMarket({ id: 'city-medellin', name: 'Medellín', countryId: 'country-co' }));
    bookingSettingsRepository.seed(new BookingSettings({ id: 'm', scope: 'market', refId: 'city-cali', noShowGraceMinutes: 90 }));
    const logger = { info: () => undefined, warn: () => undefined };
    const resolve = createNoShowGraceResolver({ marketRepository, bookingSettingsRepository, logger });

    expect(await resolve(request)).toBe(90);
    expect(await resolve(buildRequest('r-2', new Date('2026-09-21T22:00:00.000Z'), { marketId: 'city-medellin' }))).toBe(30);
  });
});
