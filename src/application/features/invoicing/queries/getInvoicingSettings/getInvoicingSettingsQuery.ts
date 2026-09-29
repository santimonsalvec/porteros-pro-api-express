import { IQuery } from '../../../../common/mediator/types.js';
import type { InvoicingSettingsResponse } from '../../commands/setInvoicingSettings/setInvoicingSettingsCommand.js';

export type GetInvoicingSettingsResult = { outcome: 'success'; settings: InvoicingSettingsResponse } | { outcome: 'not_found' };

export class GetInvoicingSettingsQuery extends IQuery<GetInvoicingSettingsResult> {
  constructor(public readonly countryId: string) {
    super();
  }
}
