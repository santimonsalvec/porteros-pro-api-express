import { beforeEach, describe, expect, it } from 'vitest';
import { UpdateClientProfileCommand } from '../../../../../src/application/features/clients/commands/updateClientProfile/updateClientProfileCommand.js';
import { UpdateClientProfileCommandHandler } from '../../../../../src/application/features/clients/commands/updateClientProfile/updateClientProfileCommandHandler.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { User } from '../../../../../src/domain/users/user.js';
import { Country } from '../../../../../src/domain/countries/country.js';

describe('UpdateClientProfileCommandHandler', () => {
  let userRepository: FakeUserRepository;
  let countryRepository: FakeCountryRepository;
  let handler: UpdateClientProfileCommandHandler;
  let user: User;

  beforeEach(async () => {
    userRepository = new FakeUserRepository();
    countryRepository = new FakeCountryRepository();
    countryRepository.seed(new Country({ id: 'c1', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
    handler = new UpdateClientProfileCommandHandler(userRepository, countryRepository);

    user = User.createFromExternalIdentity({ id: 'user-1', email: 'a@example.com', displayName: null, provider: 'google', subject: 'sub-1' });
    user.completeProfile('Old', 'Name', '+57', '3000000000');
    await userRepository.add(user);
  });

  it('updates name and whatsapp, leaving email untouched', async () => {
    const result = await handler.handle(new UpdateClientProfileCommand('user-1', 'New', 'Name', 'CO', '301 987 6543'));

    expect(result.outcome).toBe('success');
    expect(result.profile?.firstName).toBe('New');
    expect(result.profile?.email).toBe('a@example.com');
  });

  it('allows resubmitting the caller own current number without conflict', async () => {
    const result = await handler.handle(new UpdateClientProfileCommand('user-1', 'Old', 'Name', 'CO', '3000000000'));

    expect(result.outcome).toBe('success');
  });

  it('rejects a blank name, leaving stored values unchanged', async () => {
    const result = await handler.handle(new UpdateClientProfileCommand('user-1', '', 'Name', 'CO', '301 987 6543'));

    expect(result.outcome).toBe('validation_failed');
    expect((await userRepository.getById('user-1'))?.firstName).toBe('Old');
  });

  it('rejects an unrecognized country code', async () => {
    const result = await handler.handle(new UpdateClientProfileCommand('user-1', 'New', 'Name', 'ZZ', '301 987 6543'));

    expect(result.outcome).toBe('invalid_country_code');
  });

  it('rejects a number already used by a different account', async () => {
    const other = User.createFromExternalIdentity({ id: 'user-2', email: 'b@example.com', displayName: null, provider: 'google', subject: 'sub-2' });
    other.completeProfile('B', 'B', '+57', '3011111111');
    await userRepository.add(other);

    const result = await handler.handle(new UpdateClientProfileCommand('user-1', 'New', 'Name', 'CO', '301 111 1111'));

    expect(result.outcome).toBe('duplicate_phone_number');
  });

  it('rejects an update when the profile is not yet complete', async () => {
    const incomplete = User.createFromExternalIdentity({ id: 'user-3', email: 'c@example.com', displayName: null, provider: 'google', subject: 'sub-3' });
    await userRepository.add(incomplete);

    const result = await handler.handle(new UpdateClientProfileCommand('user-3', 'New', 'Name', 'CO', '301 987 6543'));

    expect(result.outcome).toBe('profile_not_complete');
  });

  it('returns not_found for a deleted account', async () => {
    const result = await handler.handle(new UpdateClientProfileCommand('does-not-exist', 'New', 'Name', 'CO', '301 987 6543'));

    expect(result.outcome).toBe('not_found');
  });
});
