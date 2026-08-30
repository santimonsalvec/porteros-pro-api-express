import { beforeEach, describe, expect, it } from 'vitest';
import { CompleteProfileCommand } from '../../../../../src/application/features/profile/commands/completeProfile/completeProfileCommand.js';
import { CompleteProfileCommandHandler } from '../../../../../src/application/features/profile/commands/completeProfile/completeProfileCommandHandler.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeTermsAcceptanceRepository } from '../../../../fakes/fakeTermsAcceptanceRepository.js';
import { FakeInternalTokenIssuer } from '../../../../fakes/fakeInternalTokenIssuer.js';
import { User } from '../../../../../src/domain/users/user.js';
import { Country } from '../../../../../src/domain/countries/country.js';

describe('CompleteProfileCommandHandler', () => {
  let userRepository: FakeUserRepository;
  let countryRepository: FakeCountryRepository;
  let termsAcceptanceRepository: FakeTermsAcceptanceRepository;
  let tokenIssuer: FakeInternalTokenIssuer;
  let handler: CompleteProfileCommandHandler;
  let user: User;

  beforeEach(async () => {
    userRepository = new FakeUserRepository();
    countryRepository = new FakeCountryRepository();
    termsAcceptanceRepository = new FakeTermsAcceptanceRepository();
    tokenIssuer = new FakeInternalTokenIssuer();
    countryRepository.seed(new Country({ id: 'c1', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));

    handler = new CompleteProfileCommandHandler(
      userRepository,
      countryRepository,
      termsAcceptanceRepository,
      tokenIssuer,
      { newId: () => 'terms-1' },
      { termsVersion: '1.0', privacyPolicyVersion: '1.0' },
    );

    user = User.createFromExternalIdentity({
      id: 'user-1',
      email: 'user@example.com',
      displayName: null,
      provider: 'google',
      subject: 'sub-1',
    });
    await userRepository.add(user);
  });

  it('completes the profile, records terms acceptance, and re-issues tokens', async () => {
    const result = await handler.handle(
      new CompleteProfileCommand('user-1', 'Jhon', 'Doe', 'CO', '300 123 4567', true, '1.2.3.4', 'test-agent'),
    );

    expect(result.outcome).toBe('success');
    expect(result.tokens).toBeDefined();
    const stored = await userRepository.getById('user-1');
    expect(stored?.isProfileComplete).toBe(true);
    expect(stored?.countryCallingCode).toBe('+57');
    expect(termsAcceptanceRepository.records).toHaveLength(1);
  });

  it('rejects a blank name without saving anything', async () => {
    const result = await handler.handle(
      new CompleteProfileCommand('user-1', '', 'Doe', 'CO', '300 123 4567', true, null, null),
    );

    expect(result.outcome).toBe('validation_failed');
    expect(result.fieldErrors?.firstName).toBeDefined();
    expect((await userRepository.getById('user-1'))?.isProfileComplete).toBe(false);
    expect(termsAcceptanceRepository.records).toHaveLength(0);
  });

  it('rejects when terms are not accepted', async () => {
    const result = await handler.handle(
      new CompleteProfileCommand('user-1', 'Jhon', 'Doe', 'CO', '300 123 4567', false, null, null),
    );

    expect(result.outcome).toBe('validation_failed');
  });

  it('rejects an unrecognized country code', async () => {
    const result = await handler.handle(
      new CompleteProfileCommand('user-1', 'Jhon', 'Doe', 'ZZ', '300 123 4567', true, null, null),
    );

    expect(result.outcome).toBe('invalid_country_code');
  });

  it('rejects a phone number already used by a different account', async () => {
    const other = User.createFromExternalIdentity({
      id: 'user-2',
      email: 'other@example.com',
      displayName: null,
      provider: 'google',
      subject: 'sub-2',
    });
    other.completeProfile('A', 'B', '+57', '3001234567');
    await userRepository.add(other);

    const result = await handler.handle(
      new CompleteProfileCommand('user-1', 'Jhon', 'Doe', 'CO', '300-123-4567', true, null, null),
    );

    expect(result.outcome).toBe('duplicate_phone_number');
  });

  it('is a no-op when the profile is already complete, identical to a non-existent account', async () => {
    user.completeProfile('Existing', 'Name', '+57', '3009999999');
    await userRepository.update(user);
    userRepository.updateCalled = false;

    const result = await handler.handle(
      new CompleteProfileCommand('user-1', 'Jhon', 'Doe', 'CO', '300 123 4567', true, null, null),
    );
    const forMissingAccount = await handler.handle(
      new CompleteProfileCommand('does-not-exist', 'Jhon', 'Doe', 'CO', '300 123 4567', true, null, null),
    );

    expect(result.outcome).toBe('already_complete');
    expect(forMissingAccount.outcome).toBe('already_complete');
    expect(userRepository.updateCalled).toBe(false);
  });
});
