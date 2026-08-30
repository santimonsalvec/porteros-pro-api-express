import { beforeEach, describe, expect, it } from 'vitest';
import { GetClientProfileQuery } from '../../../../../src/application/features/clients/queries/getClientProfile/getClientProfileQuery.js';
import { GetClientProfileQueryHandler } from '../../../../../src/application/features/clients/queries/getClientProfile/getClientProfileQueryHandler.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { User } from '../../../../../src/domain/users/user.js';

describe('GetClientProfileQueryHandler', () => {
  let userRepository: FakeUserRepository;
  let handler: GetClientProfileQueryHandler;

  beforeEach(() => {
    userRepository = new FakeUserRepository();
    handler = new GetClientProfileQueryHandler(userRepository);
  });

  it('returns the five expected fields for a completed profile', async () => {
    const user = User.createFromExternalIdentity({ id: 'user-1', email: 'a@example.com', displayName: null, provider: 'google', subject: 'sub-1' });
    user.completeProfile('Jhon', 'Doe', '+57', '300 123 4567');
    await userRepository.add(user);

    const result = await handler.handle(new GetClientProfileQuery('user-1'));

    expect(result.outcome).toBe('success');
    expect(result.profile).toEqual({
      firstName: 'Jhon',
      lastName: 'Doe',
      email: 'a@example.com',
      countryCallingCode: '+57',
      whatsAppNumber: '300 123 4567',
      createdAt: user.createdAt.toISOString(),
    });
  });

  it('represents missing name/whatsapp as null for an incomplete profile', async () => {
    const user = User.createFromExternalIdentity({ id: 'user-1', email: 'a@example.com', displayName: null, provider: 'google', subject: 'sub-1' });
    await userRepository.add(user);

    const result = await handler.handle(new GetClientProfileQuery('user-1'));

    expect(result.outcome).toBe('success');
    expect(result.profile?.firstName).toBeNull();
    expect(result.profile?.email).toBe('a@example.com');
  });

  it('returns not_found for a deleted account', async () => {
    const result = await handler.handle(new GetClientProfileQuery('does-not-exist'));

    expect(result.outcome).toBe('not_found');
  });
});
