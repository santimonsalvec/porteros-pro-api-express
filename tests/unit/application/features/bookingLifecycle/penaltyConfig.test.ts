import { describe, expect, it } from 'vitest';
import { resolvePenaltyConfig } from '../../../../../src/application/features/bookingLifecycle/common/penaltyConfig.js';
import { DEFAULT_GOALKEEPER_PENALTIES } from '../../../../../src/domain/goalkeepers/penaltyPolicy.js';
import { BookingSettings } from '../../../../../src/domain/pricing/bookingSettings.js';
import { FakeBookingSettingsRepository } from '../../../../fakes/fakeBookingSettingsRepository.js';
import { FakeCityRepository } from '../../../../fakes/fakeCityRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeRegionRepository } from '../../../../fakes/fakeRegionRepository.js';
import { buildGoalkeeperProfile, seedWalletWorld } from '../../../../fixtures/walletFixtures.js';

function setup(goalkeeperPenalties?: Record<string, number>, cityId = 'city-cali') {
  const cityRepository = new FakeCityRepository();
  const regionRepository = new FakeRegionRepository();
  const countryRepository = new FakeCountryRepository();
  seedWalletWorld({ cityRepository, regionRepository, countryRepository });
  const goalkeeperProfileRepository = new FakeGoalkeeperProfileRepository();
  goalkeeperProfileRepository.seed(buildGoalkeeperProfile('gk-1', { cityId }));
  const bookingSettingsRepository = new FakeBookingSettingsRepository();
  bookingSettingsRepository.seed(new BookingSettings({ id: 's-co', scope: 'country', refId: 'country-co', goalkeeperPenalties: goalkeeperPenalties ?? null }));
  const warnings: Record<string, unknown>[] = [];
  const deps = {
    walletContext: { goalkeeperProfileRepository, cityRepository, regionRepository, countryLookup: countryRepository },
    bookingSettingsRepository,
    logger: { info: () => undefined, warn: (entry: Record<string, unknown>) => void warnings.push(entry) },
  };
  return { deps, warnings };
}

describe('resolvePenaltyConfig (feature 018)', () => {
  it("uses the country's values when all are set, without a warning", async () => {
    const values = { lateNoticeMinutes: 60, lateSuspensionDays: 2, weeklyLimit: 4, windowDays: 10, limitSuspensionDays: 5 };
    const { deps, warnings } = setup(values);

    expect(await resolvePenaltyConfig(deps, 'gk-1')).toEqual(values);
    expect(warnings).toEqual([]);
  });

  it('fills the missing values with the defaults and names them in a warning', async () => {
    const { deps, warnings } = setup({ lateNoticeMinutes: 60 });

    expect(await resolvePenaltyConfig(deps, 'gk-1')).toEqual({ ...DEFAULT_GOALKEEPER_PENALTIES, lateNoticeMinutes: 60 });
    expect(warnings).toEqual([
      expect.objectContaining({
        outcome: 'penalty_config_defaulted',
        countryId: 'country-co',
        defaulted: ['lateSuspensionDays', 'weeklyLimit', 'windowDays', 'limitSuspensionDays'],
      }),
    ]);
  });

  it('falls back entirely to the defaults when nothing is configured or the country is unknown', async () => {
    expect(await resolvePenaltyConfig(setup().deps, 'gk-1')).toEqual(DEFAULT_GOALKEEPER_PENALTIES);
    const orphan = setup({ lateNoticeMinutes: 60 }, 'city-orphan');
    expect(await resolvePenaltyConfig(orphan.deps, 'gk-1')).toEqual(DEFAULT_GOALKEEPER_PENALTIES);
    expect(orphan.warnings).toHaveLength(1);
  });
});
