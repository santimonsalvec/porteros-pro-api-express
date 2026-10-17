import { describe, expect, it } from 'vitest';
import { UserLanguages } from '../../../../src/application/features/users/common/userLanguages.js';
import { User } from '../../../../src/domain/users/user.js';
import { FakeUserRepository } from '../../../fakes/fakeUserRepository.js';

function user(id: string, preferredLanguage: 'es' | 'en' | null): User {
  const created = User.createFromExternalIdentity({ id, email: `${id}@example.com`, displayName: null, provider: 'google', subject: id });
  created.preferredLanguage = preferredLanguage;
  return created;
}

describe('UserLanguages (feature 032)', () => {
  it('reads one person’s choice, null when they never chose or do not exist', async () => {
    const users = new FakeUserRepository();
    users.seed(user('ana', 'en'));
    users.seed(user('luis', null));
    const languages = new UserLanguages(users);

    expect(await languages.languageOf('ana')).toBe('en');
    expect(await languages.languageOf('luis')).toBeNull();
    expect(await languages.languageOf('nobody')).toBeNull();
  });

  it('reads a batch in one call, mapping every id', async () => {
    const users = new FakeUserRepository();
    users.seed(user('ana', 'en'));
    users.seed(user('luis', 'es'));
    let batches = 0;
    const counting = { getById: users.getById.bind(users), getByIds: async (ids: string[]) => { batches += 1; return users.getByIds(ids); } };
    const languages = new UserLanguages(counting);

    const result = await languages.languagesOf(['ana', 'luis', 'nobody', 'ana']);

    expect([...result.entries()]).toEqual([['ana', 'en'], ['luis', 'es'], ['nobody', null]]);
    expect(batches).toBe(1);
    expect(await languages.languagesOf([])).toEqual(new Map());
  });
});
