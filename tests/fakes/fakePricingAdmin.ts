import type { UpdateResult } from '../../src/application/features/geography/common/ports.js';
import type {
  BookingSettingsRecord,
  CommissionFields,
  CommissionRecord,
  IBookingSettingsAdmin,
  ICommissionAdmin,
  IRentalRateAdmin,
  PriceFilter,
  RentalRateRecord,
  StoredBookingSettings,
} from '../../src/application/features/pricing/common/ports.js';
import { BookingSettings } from '../../src/domain/pricing/bookingSettings.js';
import { RentalRate } from '../../src/domain/pricing/rentalRate.js';
import { CommissionSetting } from '../../src/domain/operatingBalance/commissionSetting.js';
import { FakeBookingSettingsRepository } from './fakeBookingSettingsRepository.js';
import { FakeCommissionSettingRepository } from './fakeCommissionSettingRepository.js';
import { createIn, deleteIn, matchesPriceFilter, priceRecord, updateIn } from './fakePriceStore.js';
import { FakeRentalRateRepository } from './fakeRentalRateRepository.js';

/**
 * In-memory admin price stores (spec 004 of the admin). Each works on the storage of the app's
 * read-only fake it is given, so an HTTP test sees an admin write in the quote, while the quote's
 * own fakes keep exposing no write at all.
 */

const rateRecord = (rate: RentalRate): RentalRateRecord => ({ ...priceRecord<'zone' | 'market'>(rate), durationMinutes: rate.durationMinutes });

export class FakeRentalRateAdmin implements IRentalRateAdmin {
  constructor(readonly base = new FakeRentalRateRepository()) {}

  async find(filter: PriceFilter & { durationMinutes?: number }) {
    return this.base.rates
      .filter((rate) => matchesPriceFilter(rate, filter) && (filter.durationMinutes === undefined || rate.durationMinutes === filter.durationMinutes))
      .map(rateRecord);
  }

  async getById(id: string) {
    const rate = this.base.rates.find((item) => item.id === id);
    return rate ? rateRecord(rate) : null;
  }

  async create(input: Omit<RentalRateRecord, 'revision' | 'invalid'>) {
    return createIn(
      this.base.rates,
      new RentalRate(input),
      (a, b) => a.scope === b.scope && a.refId === b.refId && a.durationMinutes === b.durationMinutes && a.modality === b.modality,
    );
  }

  async updateAmount(id: string, expectedRevision: number, amount: number) {
    return updateIn(this.base.rates, id, expectedRevision, (rate) => new RentalRate({ ...rate, amount, revision: rate.revision + 1 }));
  }

  async delete(id: string) {
    return deleteIn(this.base.rates, id);
  }
}

const commissionRecord = (setting: CommissionSetting): CommissionRecord => ({
  id: setting.id,
  scope: setting.scope,
  refId: setting.refId,
  modality: setting.modality,
  fixedAmount: setting.fixedAmount,
  percentBps: setting.percentBps,
  countryId: setting.countryId,
  validUntil: setting.validUntil,
  revision: setting.revision,
  invalid: false,
});

export class FakeCommissionAdmin implements ICommissionAdmin {
  constructor(readonly base = new FakeCommissionSettingRepository()) {}

  async find(filter: PriceFilter): Promise<CommissionRecord[]> {
    return this.base.settings.filter((setting) => matchesPriceFilter(setting, filter)).map(commissionRecord);
  }

  async getById(id: string): Promise<CommissionRecord | null> {
    const setting = this.base.settings.find((item) => item.id === id);
    return setting ? commissionRecord(setting) : null;
  }

  async create(input: Omit<CommissionRecord, 'revision' | 'invalid'>) {
    return createIn(
      this.base.settings,
      new CommissionSetting(input),
      (a, b) => a.scope === b.scope && a.refId === b.refId && a.modality === b.modality,
    );
  }

  async update(id: string, expectedRevision: number, fields: CommissionFields) {
    return updateIn(
      this.base.settings,
      id,
      expectedRevision,
      (setting) =>
        new CommissionSetting({
          ...setting,
          fixedAmount: fields.fixedAmount,
          percentBps: fields.percentBps,
          validUntil: setting.scope === 'goalkeeper' ? (fields.validUntil === undefined ? setting.validUntil : fields.validUntil) : null,
          revision: setting.revision + 1,
        }),
    );
  }

  async delete(id: string) {
    return deleteIn(this.base.settings, id);
  }
}

const settingsRecord = (settings: BookingSettings): BookingSettingsRecord => ({
  scope: settings.scope,
  refId: settings.refId,
  fields: {
    bookingWindowDays: settings.bookingWindowDays,
    minNoticeMinutes: settings.minNoticeMinutes,
    leadTimeSurcharge: settings.leadTimeSurcharge,
    freeCancellationMinutes: settings.freeCancellationMinutes,
    travelBufferMinutes: settings.travelBufferMinutes,
    goalkeeperPenalties: settings.goalkeeperPenalties,
    checkInWindow: settings.checkInWindow,
    noShowGraceMinutes: settings.noShowGraceMinutes,
    offerReminderIntervalMinutes: settings.offerReminderIntervalMinutes,
    offerMaxReminders: settings.offerMaxReminders,
  },
  revision: settings.revision,
  invalid: false,
});

/** Group subfields without the empty ones, as Mongo stores them. */
const compact = (value: object | null): Record<string, number> | null =>
  value === null ? null : (Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null)) as Record<string, number>);

export class FakeBookingSettingsAdmin implements IBookingSettingsAdmin {
  constructor(readonly base = new FakeBookingSettingsRepository()) {}

  async getByScope(scope: 'country' | 'market', refId: string): Promise<BookingSettingsRecord | null> {
    const found = this.base.settings.find((item) => item.scope === scope && item.refId === refId);
    return found ? settingsRecord(found) : null;
  }

  async save(scope: 'country' | 'market', refId: string, expectedRevision: number | null, fields: StoredBookingSettings): Promise<UpdateResult> {
    const items = this.base.settings;
    const index = items.findIndex((item) => item.scope === scope && item.refId === refId);
    const current = items[index];
    if (expectedRevision === null ? current !== undefined : current?.revision !== expectedRevision) return 'stale';
    const next = new BookingSettings({
      ...fields,
      id: current?.id ?? `${scope}:${refId}`,
      scope,
      refId,
      goalkeeperPenalties: compact(fields.goalkeeperPenalties),
      checkInWindow: compact(fields.checkInWindow),
      revision: current ? current.revision + 1 : 0,
    });
    if (current) items[index] = next;
    else items.push(next);
    return 'saved';
  }

  async listMarketScoped(): Promise<BookingSettingsRecord[]> {
    return this.base.settings.filter((item) => item.scope === 'market').map(settingsRecord);
  }
}
