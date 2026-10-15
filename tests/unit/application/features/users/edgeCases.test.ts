import { describe, expect, it } from 'vitest';
import { UpdateUserContactCommand } from '../../../../../src/application/features/users/commands/updateUserContact/updateUserContactCommand.js';
import { UpdateUserContactCommandHandler } from '../../../../../src/application/features/users/commands/updateUserContact/updateUserContactCommandHandler.js';
import { UnblockUserCommand } from '../../../../../src/application/features/users/commands/unblockUser/unblockUserCommand.js';
import { UnblockUserCommandHandler } from '../../../../../src/application/features/users/commands/unblockUser/unblockUserCommandHandler.js';
import { CorrectGoalkeeperDocumentCommand } from '../../../../../src/application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommand.js';
import { CorrectGoalkeeperDocumentCommandHandler } from '../../../../../src/application/features/goalkeepers/commands/correctGoalkeeperDocument/correctGoalkeeperDocumentCommandHandler.js';
import { blockView, memberRef, userName } from '../../../../../src/application/features/users/common/userViewing.js';
import { contactVersion, documentVersion } from '../../../../../src/domain/users/contactVersion.js';
import { User } from '../../../../../src/domain/users/user.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { DocumentType } from '../../../../../src/domain/goalkeepers/documentType.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeGoalkeeperRegistrationRepository } from '../../../../fakes/fakeGoalkeeperRegistrationRepository.js';
import { FakeDocumentTypeRepository } from '../../../../fakes/fakeDocumentTypeRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');

describe('user corrections when the store disagrees (admin spec 005)', () => {
  function world() {
    const users = new FakeUserRepository();
    const user = User.createFromExternalIdentity({ id: 'u1', email: 'u1@x.co', displayName: null, provider: 'google', subject: 's' });
    user.completeProfile('Ana', 'Portera', '+57', '3000000001');
    users.seed(user);
    const countries = new FakeCountryRepository();
    countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
    return { users, countries, version: contactVersion(user) };
  }

  it('changes nothing when the values are the same', async () => {
    const { users, countries, version } = world();
    const result = await new UpdateUserContactCommandHandler({ users, contacts: users, countries }).handle(new UpdateUserContactCommand('u1', version, { firstName: 'Ana' }));

    expect(result).toMatchObject({ outcome: 'corrected', audit: { changedFields: [] } });
  });

  it('answers stale or duplicate when the write finds the user changed or the number taken', async () => {
    const { users, countries, version } = world();
    for (const answer of ['stale', 'duplicate'] as const) {
      const handler = new UpdateUserContactCommandHandler({ users, countries, contacts: { updateContactIfUnchanged: async () => answer } });
      expect((await handler.handle(new UpdateUserContactCommand('u1', version, { lastName: 'Otra' }))).outcome).toBe(answer === 'stale' ? 'stale' : 'duplicate_phone_number');
    }
  });

  it('a lone country asks for the number too', async () => {
    const { users, countries, version } = world();
    const result = await new UpdateUserContactCommandHandler({ users, contacts: users, countries }).handle(new UpdateUserContactCommand('u1', version, { countryCode: 'CO' }));

    expect(result).toEqual({ outcome: 'validation_failed', fieldErrors: { whatsAppNumber: expect.any(String) } });
  });

  it('refuses an unblock without a reason, and keeps an unknown member as a team member', async () => {
    const { users } = world();
    const handler = new UnblockUserCommandHandler({ users, blocks: new FakeUserBlockRepository(), profiles: new FakeGoalkeeperProfileRepository(), clock: { now: () => NOW } });

    expect(await handler.handle(new UnblockUserCommand('staff', 'u1', ''))).toMatchObject({ outcome: 'validation_failed' });
    expect(await handler.handle(new UnblockUserCommand('staff', 'u1', 'Nunca bloqueado'))).toMatchObject({ outcome: 'replayed', result: { availableForOffers: null } });
    expect(await memberRef({ findByUserId: async () => null }, null)).toBeNull();
    expect(await blockView({ findByUserId: async () => null }, null)).toBeNull();
    expect(userName({ firstName: null, lastName: null, displayName: null })).toBeNull();
  });
});

describe('document corrections when the store disagrees', () => {
  it('answers stale or duplicate from the writer', async () => {
    const profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(buildGoalkeeperProfile('g1'));
    const documentTypes = new FakeDocumentTypeRepository();
    documentTypes.seed(new DocumentType({ id: 'd', code: 'CC', name: 'Cédula' }));
    const version = documentVersion({ documentType: 'CC', documentNumber: '1020304050' });
    for (const [answer, outcome] of [['stale', 'stale'], ['duplicate', 'document_already_registered']] as const) {
      const handler = new CorrectGoalkeeperDocumentCommandHandler({
        profiles, documentTypes, registrations: new FakeGoalkeeperRegistrationRepository(), writer: { correct: async () => answer },
      });
      expect((await handler.handle(new CorrectGoalkeeperDocumentCommand('g1', version, 'CC', '9999'))).outcome).toBe(outcome);
    }
  });
});
