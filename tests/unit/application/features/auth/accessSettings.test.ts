import { describe, expect, it } from 'vitest';
import { GetAccessSettingsQuery } from '../../../../../src/application/features/auth/queries/getAccessSettings/getAccessSettingsQuery.js';
import { GetAccessSettingsQueryHandler } from '../../../../../src/application/features/auth/queries/getAccessSettings/getAccessSettingsQueryHandler.js';
import { SetAccessSettingsCommand } from '../../../../../src/application/features/auth/commands/setAccessSettings/setAccessSettingsCommand.js';
import { SetAccessSettingsCommandHandler } from '../../../../../src/application/features/auth/commands/setAccessSettings/setAccessSettingsCommandHandler.js';
import { FakeAccessSettingsRepository } from '../../../../fakes/fakeAccessSettingsRepository.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';

const NOW = new Date('2026-10-14T15:02:00.000Z');
const LIMITS = { min: 1, max: 10, recommended: 2 };

function setup() {
  const repository = new FakeAccessSettingsRepository();
  const clock = new FixedClock(NOW);
  return {
    repository,
    get: () => new GetAccessSettingsQueryHandler(repository).handle(new GetAccessSettingsQuery()),
    set: (minutes: unknown, revision: number) => new SetAccessSettingsCommandHandler(repository, clock).handle(new SetAccessSettingsCommand('user-1', minutes, revision)),
  };
}

describe('access settings (admin spec 009, US4)', () => {
  it('reads the default 2 minutes while nobody saved them', async () => {
    expect(await setup().get()).toEqual({ loginCodeExpiryMinutes: 2, isDefault: true, revision: 0, updatedAt: null, updatedBy: null, limits: LIMITS });
  });

  it('saves the first value at revision 0, then at the revision read', async () => {
    const h = setup();

    expect(await h.set(5, 0)).toEqual({
      outcome: 'saved',
      settings: { loginCodeExpiryMinutes: 5, isDefault: false, revision: 0, updatedAt: NOW, updatedBy: 'user-1', limits: LIMITS },
    });
    expect((await h.set(3, 0)).outcome).toBe('saved');
    expect(await h.get()).toMatchObject({ loginCodeExpiryMinutes: 3, revision: 1 });
  });

  it('refuses a value outside 1–10 or not whole', async () => {
    const h = setup();
    for (const minutes of [0, 11, 2.5, '5', null]) {
      expect(await h.set(minutes, 0)).toEqual({
        outcome: 'invalid',
        fieldErrors: { loginCodeExpiryMinutes: 'Escribe un número entero de minutos entre 1 y 10' },
      });
    }
    expect(h.repository.stored).toBeNull();
  });

  it('refuses a save on a revision that already changed', async () => {
    const h = setup();
    await h.set(5, 0);

    expect(await h.set(4, 3)).toEqual({ outcome: 'stale' });
    expect(await h.set(4, 0)).toMatchObject({ outcome: 'saved' });
    expect(await h.set(6, 0)).toEqual({ outcome: 'stale' });
  });
});
