import type { IQueryHandler } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';
import type { IUserLanguages } from '../../../users/common/userLanguages.js';
import { GetPreferredLanguageQuery } from './getPreferredLanguageQuery.js';

export class GetPreferredLanguageQueryHandler implements IQueryHandler<GetPreferredLanguageQuery, Language | null> {
  constructor(private readonly languages: IUserLanguages) {}

  handle(query: GetPreferredLanguageQuery): Promise<Language | null> {
    return this.languages.languageOf(query.userId);
  }
}
