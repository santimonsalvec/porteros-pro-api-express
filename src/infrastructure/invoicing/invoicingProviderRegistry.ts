import type { IInvoicingProvider, IInvoicingProviderRegistry } from '../../application/features/invoicing/common/ports.js';

/** The invoicing providers this deployment can use, by name (research.md §10). */
export class InvoicingProviderRegistry implements IInvoicingProviderRegistry {
  private readonly providers: Map<string, IInvoicingProvider>;

  constructor(providers: readonly IInvoicingProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.name, provider]));
  }

  get(name: string): IInvoicingProvider | null {
    return this.providers.get(name) ?? null;
  }
}
