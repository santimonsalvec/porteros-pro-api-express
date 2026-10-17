import { IQuery } from '../../../../common/mediator/types.js';
import type { Permission } from '../../../../../domain/staff/permissionCatalog.js';
import type { AdminSessionSummary } from '../../common/sessionResponse.js';
import type { Language } from '../../../../../domain/i18n/language.js';

/** What the admin web needs to draw its shell: who, which role, which permissions (contracts/admin-access.md). */
export interface AdminMe {
  staffId: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: { id: string; name: string; system: boolean };
  permissions: Permission[];
  session: AdminSessionSummary;
  /** The language saved on the member's account (feature 032); null until they choose one. */
  preferredLanguage: Language | null;
}

export type GetAdminMeResult = { outcome: 'ok'; me: AdminMe } | { outcome: 'not_found' };

export class GetAdminMeQuery extends IQuery<GetAdminMeResult> {
  constructor(
    readonly staffId: string,
    readonly sessionId: string,
  ) {
    super();
  }
}
