import type { Language } from '../../src/domain/i18n/language.js';
import type { IUserLanguages } from '../../src/application/features/users/common/userLanguages.js';

/** The languages people chose, by user id; anyone else has none. */
export class FakeUserLanguages implements IUserLanguages {
  readonly reads: string[][] = [];

  constructor(private readonly languages: Record<string, Language> = {}) {}

  /** What `userId` chose from now on. */
  set(userId: string, language: Language): void {
    this.languages[userId] = language;
  }

  async languageOf(userId: string): Promise<Language | null> {
    this.reads.push([userId]);
    return this.languages[userId] ?? null;
  }

  async languagesOf(userIds: readonly string[]): Promise<Map<string, Language | null>> {
    this.reads.push([...userIds]);
    return new Map(userIds.map((id) => [id, this.languages[id] ?? null]));
  }
}
