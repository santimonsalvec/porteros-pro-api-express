import type { IInvoicingSettingsRepository } from '../../src/application/features/invoicing/common/ports.js';
import { InvoicingSettings } from '../../src/domain/invoicing/invoicingSettings.js';

export const COLOMBIA_SIIGO_CONFIG = {
  partnerId: 'PorterosPRO',
  invoiceDocumentId: 24446,
  creditNoteDocumentId: 24447,
  sellerId: 629,
  commissionProductCode: 'COMISION',
  penaltyProductCode: 'PENALIDAD',
  vatTaxId: 13156,
  paymentMethodId: 5636,
};

export class FakeInvoicingSettingsRepository implements IInvoicingSettingsRepository {
  private readonly state = new Map<string, InvoicingSettings>();

  /** Colombia with Siigo by default. */
  seed(countryId = 'country-co', config: Record<string, unknown> = COLOMBIA_SIIGO_CONFIG): InvoicingSettings {
    const settings = InvoicingSettings.rehydrate({ countryId, provider: 'siigo', config, updatedAt: new Date('2026-09-28T00:00:00.000Z'), updatedBy: 'admin-seed' });
    this.state.set(countryId, settings);
    return settings;
  }

  clear(): void {
    this.state.clear();
  }

  async getByCountry(countryId: string): Promise<InvoicingSettings | null> {
    return this.state.get(countryId) ?? null;
  }

  async save(settings: InvoicingSettings): Promise<void> {
    this.state.set(settings.countryId, settings);
  }
}
