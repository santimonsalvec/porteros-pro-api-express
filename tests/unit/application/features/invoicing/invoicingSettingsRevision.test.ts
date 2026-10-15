import { describe, expect, it } from 'vitest';
import { SetInvoicingSettingsCommand } from '../../../../../src/application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommand.js';
import { SetInvoicingSettingsCommandHandler } from '../../../../../src/application/features/invoicing/commands/setInvoicingSettings/setInvoicingSettingsCommandHandler.js';
import { GetInvoicingSettingsQuery } from '../../../../../src/application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQuery.js';
import { GetInvoicingSettingsQueryHandler } from '../../../../../src/application/features/invoicing/queries/getInvoicingSettings/getInvoicingSettingsQueryHandler.js';
import { COLOMBIA_SIIGO_CONFIG } from '../../../../fakes/fakeInvoicingSettingsRepository.js';
import { InvoicingHarness } from './invoicingHarness.js';

// Admin spec 007, US5 (FR-025): every save of a country's provider names the revision it read.

function setup() {
  const harness = new InvoicingHarness();
  const setter = new SetInvoicingSettingsCommandHandler(harness.operatingBalance.countries, harness.settings, harness.secrets, harness.clock, harness.logger);
  const save = (revision: number | null, config: Record<string, unknown> = COLOMBIA_SIIGO_CONFIG) =>
    setter.handle(new SetInvoicingSettingsCommand('admin-1', 'country-co', 'siigo', config, revision));
  const read = () => new GetInvoicingSettingsQueryHandler(harness.settings, harness.secrets, harness.operatingBalance.countries).handle(new GetInvoicingSettingsQuery('country-co'));
  return { harness, save, read };
}

describe('SetInvoicingSettingsCommandHandler revision', () => {
  it('creates at revision 0 and moves up one with each save', async () => {
    const { harness, save, read } = setup();
    harness.settings.clear();

    expect(await save(null)).toMatchObject({ outcome: 'saved', settings: { revision: 0 } });
    expect(await save(0, { ...COLOMBIA_SIIGO_CONFIG, sellerId: 700 })).toMatchObject({ outcome: 'saved', settings: { revision: 1, config: { sellerId: 700 } } });
    expect(await read()).toMatchObject({ outcome: 'success', settings: { revision: 1 } });
  });

  it('refuses an old revision and a create over existing settings, changing nothing', async () => {
    const { save, read } = setup();

    expect(await save(0)).toMatchObject({ outcome: 'saved' });
    expect(await save(0, { ...COLOMBIA_SIIGO_CONFIG, sellerId: 1 })).toEqual({ outcome: 'stale' });
    expect(await save(null)).toEqual({ outcome: 'stale' });
    expect(await read()).toMatchObject({ settings: { revision: 1, config: { sellerId: COLOMBIA_SIIGO_CONFIG.sellerId } } });
  });
});
