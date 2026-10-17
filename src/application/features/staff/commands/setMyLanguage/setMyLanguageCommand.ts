import { ICommand } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';

export type SetMyLanguageResult = { outcome: 'saved' } | { outcome: 'not_found' };

/** The language a staff member reads the admin in (feature 032), kept on their linked user. */
export class SetMyLanguageCommand extends ICommand<SetMyLanguageResult> {
  constructor(
    readonly staffId: string,
    readonly language: Language,
  ) {
    super();
  }
}
