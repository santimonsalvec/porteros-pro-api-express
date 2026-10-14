import { IQuery } from '../../../../common/mediator/types.js';
import type { AccessSettingsResponse } from '../../common/accessSettingsResponse.js';

/** The sign-in code's expiry, or the default when nobody saved it (admin spec 009, US4). */
export class GetAccessSettingsQuery extends IQuery<AccessSettingsResponse> {}
