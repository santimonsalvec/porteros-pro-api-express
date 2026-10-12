import { beforeEach, describe, expect, it } from 'vitest';
import { UpdateUserContactCommand } from '../../../../../src/application/features/users/commands/updateUserContact/updateUserContactCommand.js';
import { UpdateUserContactCommandHandler } from '../../../../../src/application/features/users/commands/updateUserContact/updateUserContactCommandHandler.js';
import { contactVersion } from '../../../../../src/domain/users/contactVersion.js';
import { User } from '../../../../../src/domain/users/user.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';

function user(id: string, phone?: string) {
  const created = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: 'G', provider: 'google', subject: `s-${id}` });
  if (phone) created.completeProfile('Ana', 'Portera', '+57', phone);
  return created;
}

describe('UpdateUserContactCommand (admin spec 005, US6)', () => {
  let users: FakeUserRepository;
  let handler: UpdateUserContactCommandHandler;
  let version: string;

  beforeEach(() => {
    users = new FakeUserRepository();
    users.seed(user('u1', '3000000001'));
    users.seed(user('u2', '3000000002'));
    users.seed(user('u-new'));
    const countries = new FakeCountryRepository();
    countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
    countries.seed(new Country({ id: 'ec', name: 'Ecuador', dialCode: '+593', countryCode: 'EC' }));
    handler = new UpdateUserContactCommandHandler({ users, contacts: users, countries });
    version = contactVersion({ firstName: 'Ana', lastName: 'Portera', countryCallingCode: '+57', normalizedPhoneNumber: '573000000001' });
  });

  const send = (fields: ConstructorParameters<typeof UpdateUserContactCommand>[2], v = version, userId = 'u1') => handler.handle(new UpdateUserContactCommand(userId, v, fields));

  it('corrects the name and keeps the rest; the audit view has only the last 4 digits', async () => {
    const result = await send({ lastName: ' Gómez ' });

    expect(result).toEqual({
      outcome: 'corrected',
      audit: {
        id: 'u1', firstName: 'Ana', lastName: 'Gómez', countryCallingCode: '+57', numberEnding: '0001', changedFields: ['lastName'], isProfileComplete: true,
        version: contactVersion({ firstName: 'Ana', lastName: 'Gómez', countryCallingCode: '+57', normalizedPhoneNumber: '573000000001' }),
      },
    });
    expect((await users.getById('u1'))!.lastName).toBe('Gómez');
  });

  it('corrects the WhatsApp with the country, normalised like the app', async () => {
    const result = await send({ countryCode: 'EC', whatsAppNumber: '099 123 4567' });

    expect(result).toMatchObject({ outcome: 'corrected', audit: { countryCallingCode: '+593', numberEnding: '4567', changedFields: ['countryCallingCode', 'whatsAppNumber'] } });
    expect((await users.getById('u1'))!.normalizedPhoneNumber).toBe('5930991234567');
    expect(JSON.stringify(result)).not.toContain('0991234567');
  });

  it('refuses a number another user has, without saying whose', async () => {
    expect(await send({ countryCode: 'CO', whatsAppNumber: '300 000 0002' })).toEqual({ outcome: 'duplicate_phone_number' });
  });

  it('refuses invalid values, an unknown country, a lone phone field and a stale version', async () => {
    expect(await send({ firstName: '' })).toMatchObject({ outcome: 'validation_failed', fieldErrors: { firstName: expect.any(String) } });
    expect(await send({ countryCode: 'ZZ', whatsAppNumber: '3001112222' })).toEqual({ outcome: 'invalid_country_code' });
    expect(await send({ whatsAppNumber: '3001112222' })).toMatchObject({ outcome: 'validation_failed', fieldErrors: { countryCode: expect.any(String) } });
    expect(await send({ firstName: 'Otra' }, 'old')).toEqual({ outcome: 'stale' });
  });

  it('answers not_found and profile_incomplete', async () => {
    expect(await send({ firstName: 'X' }, version, 'nobody')).toEqual({ outcome: 'not_found' });
    expect(await send({ firstName: 'X' }, version, 'u-new')).toEqual({ outcome: 'profile_incomplete' });
  });
});
