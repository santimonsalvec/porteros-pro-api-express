import { IQuery } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';

/** The language a person chose, or null (feature 032); read by `GET /auth/me`. */
export class GetPreferredLanguageQuery extends IQuery<Language | null> {
  constructor(public readonly userId: string) {
    super();
  }
}
