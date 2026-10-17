import type { Language } from '../../../../domain/i18n/language.js';
import type { IUserRepository } from '../../auth/common/ports.js';

/**
 * The language each person chose, for whoever writes to them (feature 032): notices, the payment
 * return page, the test push, the sign-in code email. Null when they never chose one — the caller
 * then falls back with `resolveLanguage`.
 */
export interface IUserLanguages {
  languageOf(userId: string): Promise<Language | null>;
  /** Every id is a key of the result; unknown users map to null. One read for the whole batch. */
  languagesOf(userIds: readonly string[]): Promise<Map<string, Language | null>>;
}

export class UserLanguages implements IUserLanguages {
  constructor(private readonly users: Pick<IUserRepository, 'getById' | 'getByIds'>) {}

  async languageOf(userId: string): Promise<Language | null> {
    const user = await this.users.getById(userId);
    return user?.preferredLanguage ?? null;
  }

  async languagesOf(userIds: readonly string[]): Promise<Map<string, Language | null>> {
    const unique = [...new Set(userIds)];
    const result = new Map<string, Language | null>(unique.map((id) => [id, null]));
    if (unique.length === 0) return result;
    for (const user of await this.users.getByIds(unique)) {
      result.set(user.id, user.preferredLanguage);
    }
    return result;
  }
}
