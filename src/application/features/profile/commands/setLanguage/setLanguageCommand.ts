import { ICommand } from '../../../../common/mediator/types.js';
import type { Language } from '../../../../../domain/i18n/language.js';

export type SetLanguageResult = { outcome: 'saved' } | { outcome: 'user_not_found' };

/** The signed-in person chooses the language they read the product in (feature 032, FR-007). */
export class SetLanguageCommand extends ICommand<SetLanguageResult> {
  constructor(
    public readonly userId: string,
    public readonly language: Language,
  ) {
    super();
  }
}
