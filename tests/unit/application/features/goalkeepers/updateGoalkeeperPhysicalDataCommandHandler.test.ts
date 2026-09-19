import { describe, expect, it } from 'vitest';
import { UpdateGoalkeeperPhysicalDataCommand } from '../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommand.js';
import { UpdateGoalkeeperPhysicalDataCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/updateGoalkeeperPhysicalData/updateGoalkeeperPhysicalDataCommandHandler.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { GoalkeeperRegistration } from '../../../../../src/domain/goalkeepers/goalkeeperRegistration.js';

function buildHandler() {
  const profileRepository = new FakeGoalkeeperProfileRepository();
  const registrationRepository = new FakeGoalkeeperRegistrationRepository();
  profileRepository.seed(
    new GoalkeeperProfile({
      id: 'gp-1',
      userId: 'user-1',
      documentType: 'cedula_ciudadania',
      documentNumber: '123',
      issueDate: new Date('2013-01-01'),
      birthDate: new Date('1995-01-01'),
      documentPhotoAId: 'img-a',
      documentPhotoBId: 'img-b',
      heightCm: 185,
      weightKg: 78,
      cityId: 'city-envigado',
      zoneIds: ['zone-bello'],
      activatedAt: new Date('2026-08-30'),
    }),
  );
  return {
    profileRepository,
    registrationRepository,
    handler: new UpdateGoalkeeperPhysicalDataCommandHandler(profileRepository, registrationRepository),
  };
}

describe('UpdateGoalkeeperPhysicalDataCommandHandler', () => {
  it('updates only the height when only the height is sent, leaving the weight untouched', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 190, undefined));

    expect(result.outcome).toBe('success');
    expect(result.goalkeeper).toMatchObject({ status: 'active', heightCm: 190, weightKg: 78 });
    const stored = await profileRepository.getByUserId('user-1');
    expect(stored?.heightCm).toBe(190);
    expect(stored?.weightKg).toBe(78);
  });

  it('updates only the weight when only the weight is sent, leaving the height untouched', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', undefined, 82));

    expect(result.outcome).toBe('success');
    const stored = await profileRepository.getByUserId('user-1');
    expect(stored?.heightCm).toBe(185);
    expect(stored?.weightKg).toBe(82);
  });

  it('updates both fields when both are sent, and is idempotent when the same values are sent again', async () => {
    const { handler, profileRepository } = buildHandler();

    await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 190, 82));
    const repeated = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 190, 82));

    expect(repeated.outcome).toBe('success');
    const stored = await profileRepository.getByUserId('user-1');
    expect([stored?.heightCm, stored?.weightKg]).toEqual([190, 82]);
  });

  it('accepts the exact boundary values', async () => {
    const { handler } = buildHandler();

    expect((await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 120, 40))).outcome).toBe('success');
    expect((await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 230, 150))).outcome).toBe('success');
  });

  it.each([
    ['height below range', 119, undefined, 'heightCm'],
    ['height above range', 231, undefined, 'heightCm'],
    ['weight below range', undefined, 39, 'weightKg'],
    ['weight above range', undefined, 151, 'weightKg'],
  ])('rejects %s with a field error and writes nothing', async (_label, heightCm, weightKg, field) => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', heightCm, weightKg));

    expect(result.outcome).toBe('validation_failed');
    expect(Object.keys(result.fieldErrors ?? {})).toEqual([field]);
    const stored = await profileRepository.getByUserId('user-1');
    expect([stored?.heightCm, stored?.weightKg]).toEqual([185, 78]);
  });

  it('writes neither field when one of two is invalid', async () => {
    const { handler, profileRepository } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 190, 999));

    expect(result.outcome).toBe('validation_failed');
    expect((await profileRepository.getByUserId('user-1'))?.heightCm).toBe(185);
  });

  it('reports not_a_goalkeeper when the user has neither a profile nor a registration', async () => {
    const { handler } = buildHandler();

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('someone-else', 190, 82));

    expect(result.outcome).toBe('not_a_goalkeeper');
  });

  it('reports not_active for a draft registration, and does not create or change anything', async () => {
    const { handler, registrationRepository, profileRepository } = buildHandler();
    const draft = GoalkeeperRegistration.createEmpty('reg-2', 'user-2');
    draft.savePhysicalData({ heightCm: 170, weightKg: 60 });
    registrationRepository.seed(draft);

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-2', 190, 82));

    expect(result.outcome).toBe('not_active');
    expect(await profileRepository.getByUserId('user-2')).toBeNull();
    expect((await registrationRepository.getByUserId('user-2'))?.physicalData).toEqual({ heightCm: 170, weightKg: 60 });
  });

  it('decides from the profile in the database: a profile alone is enough, whatever the registration says', async () => {
    const { handler, registrationRepository } = buildHandler();
    // Registration still says in_progress (e.g. activation was interrupted after the profile was written).
    registrationRepository.seed(GoalkeeperRegistration.createEmpty('reg-1', 'user-1'));

    const result = await handler.handle(new UpdateGoalkeeperPhysicalDataCommand('user-1', 190, undefined));

    expect(result.outcome).toBe('success');
  });
});
