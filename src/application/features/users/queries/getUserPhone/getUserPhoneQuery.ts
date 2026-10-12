import { IQuery } from '../../../../common/mediator/types.js';

export type GetUserPhoneResult =
  | { outcome: 'ok'; phone: { countryCallingCode: string; whatsAppNumber: string } }
  | { outcome: 'not_found' }
  | { outcome: 'phone_not_set' };

/** A user's WhatsApp number: a sensitive read, audited by its route (FR-004). */
export class GetUserPhoneQuery extends IQuery<GetUserPhoneResult> {
  constructor(readonly userId: string) {
    super();
  }
}
