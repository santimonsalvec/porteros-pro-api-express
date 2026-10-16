import { beforeEach, describe, expect, it } from 'vitest';
import { BookingSettings } from '../../../../../../src/domain/pricing/bookingSettings.js';
import type { StoredBookingSettings } from '../../../../../../src/application/features/pricing/common/ports.js';
import type { MarketRuleFields } from '../../../../../../src/application/features/pricing/common/bookingRules.js';
import { GetCountryBookingSettingsQuery } from '../../../../../../src/application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQuery.js';
import { GetCountryBookingSettingsQueryHandler } from '../../../../../../src/application/features/pricing/queries/getCountryBookingSettings/getCountryBookingSettingsQueryHandler.js';
import { GetMarketBookingSettingsQuery } from '../../../../../../src/application/features/pricing/queries/getMarketBookingSettings/getMarketBookingSettingsQuery.js';
import { GetMarketBookingSettingsQueryHandler } from '../../../../../../src/application/features/pricing/queries/getMarketBookingSettings/getMarketBookingSettingsQueryHandler.js';
import { SaveCountryBookingSettingsCommand } from '../../../../../../src/application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommand.js';
import { SaveCountryBookingSettingsCommandHandler } from '../../../../../../src/application/features/pricing/commands/saveCountryBookingSettings/saveCountryBookingSettingsCommandHandler.js';
import { SaveMarketBookingSettingsCommand } from '../../../../../../src/application/features/pricing/commands/saveMarketBookingSettings/saveMarketBookingSettingsCommand.js';
import { SaveMarketBookingSettingsCommandHandler } from '../../../../../../src/application/features/pricing/commands/saveMarketBookingSettings/saveMarketBookingSettingsCommandHandler.js';
import { pricingKit } from '../pricingTestKit.js';

let kit: ReturnType<typeof pricingKit>;
const tiers = { tiers: [{ fromMinutes: 0, toMinutes: 180, amount: 5000 }, { fromMinutes: 180, toMinutes: null, amount: 0 }] };
const EMPTY: StoredBookingSettings = {
  bookingWindowDays: null,
  minNoticeMinutes: null,
  leadTimeSurcharge: null,
  freeCancellationMinutes: null,
  travelBufferMinutes: null,
  goalkeeperPenalties: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
  offerReminderIntervalMinutes: null,
  offerMaxReminders: null,
};
const COLOMBIA = { ...EMPTY, bookingWindowDays: 7, minNoticeMinutes: 60, leadTimeSurcharge: tiers, freeCancellationMinutes: 60, travelBufferMinutes: 30 };
const CITY_FIELDS: MarketRuleFields = {
  bookingWindowDays: null,
  minNoticeMinutes: null,
  leadTimeSurcharge: null,
  freeCancellationMinutes: null,
  travelBufferMinutes: null,
  checkInWindow: null,
  noShowGraceMinutes: null,
  offerReminderIntervalMinutes: null,
  offerMaxReminders: null,
};

const seedCountry = (fields: Partial<StoredBookingSettings> = COLOMBIA) =>
  kit.bookingSettings.base.seed(new BookingSettings({ id: 'bs-co', scope: 'country', refId: 'co', ...(fields as object) } as ConstructorParameters<typeof BookingSettings>[0]));
const seedMedellin = (fields: Partial<StoredBookingSettings>) =>
  kit.bookingSettings.base.seed(new BookingSettings({ id: 'bs-med', scope: 'market', refId: 'med', ...(fields as object) } as ConstructorParameters<typeof BookingSettings>[0]));

const saveCountry = (fields: StoredBookingSettings, revision: number | null = null, acknowledgeWarnings = false) =>
  new SaveCountryBookingSettingsCommandHandler(kit).handle(new SaveCountryBookingSettingsCommand('co', revision, fields, acknowledgeWarnings));
const saveCity = (fields: Partial<MarketRuleFields>, revision: number | null = null, acknowledgeWarnings = false, marketId = 'med') =>
  new SaveMarketBookingSettingsCommandHandler(kit).handle(new SaveMarketBookingSettingsCommand(marketId, revision, { ...CITY_FIELDS, ...fields }, acknowledgeWarnings));

beforeEach(() => {
  kit = pricingKit();
});

describe('GetCountryBookingSettingsQuery', () => {
  const read = (countryId = 'co') => new GetCountryBookingSettingsQueryHandler(kit).handle(new GetCountryBookingSettingsQuery(countryId));

  it('shows the country values and the defaults of the optional ones', async () => {
    seedCountry();
    expect(await read()).toEqual({
      outcome: 'ok',
      settings: {
        countryId: 'co',
        countryName: 'Colombia',
        currency: 'COP',
        own: COLOMBIA,
        defaults: {
          freeCancellationMinutes: 60,
          travelBufferMinutes: 30,
          noShowGraceMinutes: 60,
          goalkeeperPenalties: { lateNoticeMinutes: 120, lateSuspensionDays: 3, weeklyLimit: 3, windowDays: 7, limitSuspensionDays: 7 },
          checkInWindow: { opensMinutesBefore: 30, closesMinutesAfter: 15 },
          offerReminderIntervalMinutes: 5,
          offerMaxReminders: 3,
        },
        invalid: false,
        revision: 0,
      },
    });
  });

  it('shows an empty country with revision null, and is not found for an unknown one', async () => {
    expect(await read()).toMatchObject({ outcome: 'ok', settings: { own: EMPTY, revision: null } });
    expect(await read('pe')).toEqual({ outcome: 'not_found' });
  });
});

describe('GetMarketBookingSettingsQuery', () => {
  const read = (marketId: string) => new GetMarketBookingSettingsQueryHandler(kit).handle(new GetMarketBookingSettingsQuery(marketId));

  it('shows, field by field, the city value, the country value and where the effective one comes from', async () => {
    seedCountry();
    seedMedellin({ travelBufferMinutes: 45 });
    const result = await read('med');
    expect(result).toMatchObject({
      outcome: 'ok',
      settings: {
        marketId: 'med',
        marketName: 'Medellín',
        countryName: 'Colombia',
        own: { ...CITY_FIELDS, travelBufferMinutes: 45 },
        country: { bookingWindowDays: 7, minNoticeMinutes: 60, leadTimeSurcharge: tiers, freeCancellationMinutes: 60, travelBufferMinutes: 30 },
        effective: {
          bookingWindowDays: { value: 7, origin: 'country' },
          travelBufferMinutes: { value: 45, origin: 'market' },
        },
        revision: 0,
      },
    });
  });

  it('sends a satellite to its anchor, and is not found for an unknown city', async () => {
    expect(await read('nowhere')).toEqual({ outcome: 'not_found' });
  });
});

describe('SaveCountryBookingSettingsCommand', () => {
  it('creates the country rules, then edits them at the revision read', async () => {
    expect(await saveCountry(COLOMBIA)).toEqual({ outcome: 'saved' });
    expect(await saveCountry({ ...COLOMBIA, bookingWindowDays: 10 }, 0)).toEqual({ outcome: 'saved' });
    expect(await saveCountry({ ...COLOMBIA, bookingWindowDays: 11 }, 0)).toEqual({ outcome: 'stale' });
    expect((await kit.bookingSettings.getByScope('country', 'co'))?.fields.bookingWindowDays).toBe(10);
  });

  it('answers every broken value on its path, tiers included', async () => {
    const result = await saveCountry({
      ...COLOMBIA,
      bookingWindowDays: 91,
      leadTimeSurcharge: { tiers: [{ fromMinutes: 0, toMinutes: 180, amount: 0 }, { fromMinutes: 150, toMinutes: null, amount: 0 }] },
      checkInWindow: { opensMinutesBefore: 0, closesMinutesAfter: 15 },
    });
    expect(result).toEqual({
      outcome: 'invalid',
      fieldErrors: {
        bookingWindowDays: 'above_limit',
        'leadTimeSurcharge.tiers.1.fromMinutes': 'tier_overlap',
        'checkInWindow.opensMinutesBefore': 'out_of_range',
      },
    });
  });

  it('refuses a change that leaves Medellín with a notice not above its buffer, naming it', async () => {
    seedCountry();
    seedMedellin({ travelBufferMinutes: 45 });
    expect(await saveCountry({ ...COLOMBIA, minNoticeMinutes: 40 }, 0)).toEqual({
      outcome: 'notice_violation',
      violations: [
        { marketId: 'med', marketName: 'Medellín', minNoticeMinutes: 40, travelBufferMinutes: 45, origins: { minNoticeMinutes: 'country', travelBufferMinutes: 'market' } },
      ],
    });
  });

  it('holds back a buffer above the free cancellation until confirmed', async () => {
    const held = await saveCountry({ ...COLOMBIA, freeCancellationMinutes: 20 });
    expect(held).toMatchObject({ outcome: 'warnings', warnings: [{ code: 'travel_buffer_exceeds_free_cancellation', data: { levels: ['Colombia'] } }] });
    expect(await saveCountry({ ...COLOMBIA, freeCancellationMinutes: 20 }, null, true)).toEqual({ outcome: 'saved' });
  });

  it('warns how many operating cities stop quoting when a required value is removed', async () => {
    seedCountry();
    expect(await saveCountry({ ...COLOMBIA, bookingWindowDays: null }, 0)).toMatchObject({
      outcome: 'warnings',
      warnings: [{ code: 'required_setting_removed', data: { field: 'bookingWindowDays', operatingMarkets: 1 } }],
    });
  });

  it('is not found for an unknown country', async () => {
    expect(await new SaveCountryBookingSettingsCommandHandler(kit).handle(new SaveCountryBookingSettingsCommand('pe', null, COLOMBIA, false))).toEqual({
      outcome: 'not_found',
    });
  });
});

describe('SaveMarketBookingSettingsCommand', () => {
  beforeEach(() => seedCountry());

  it('overrides only what changes, and inherits again when emptied', async () => {
    expect(await saveCity({ travelBufferMinutes: 45 })).toEqual({ outcome: 'saved' });
    expect(await saveCity({ travelBufferMinutes: null }, 0)).toEqual({ outcome: 'saved' });
    expect((await kit.bookingSettings.getByScope('market', 'med'))?.fields).toMatchObject({ travelBufferMinutes: null, goalkeeperPenalties: null });
  });

  it('judges the notice on the values the city ends up with', async () => {
    expect(await saveCity({ travelBufferMinutes: 60 })).toMatchObject({
      outcome: 'notice_violation',
      violations: [{ marketId: 'med', minNoticeMinutes: 60, travelBufferMinutes: 60 }],
    });
  });

  it('refuses a satellite and an unknown city', async () => {
    expect(await saveCity({}, null, false, 'nowhere')).toEqual({ outcome: 'not_found' });
  });
});
