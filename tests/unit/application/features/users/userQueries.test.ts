import { beforeEach, describe, expect, it } from 'vitest';
import { ListUsersQuery } from '../../../../../src/application/features/users/queries/listUsers/listUsersQuery.js';
import { ListUsersQueryHandler } from '../../../../../src/application/features/users/queries/listUsers/listUsersQueryHandler.js';
import { GetUserQuery } from '../../../../../src/application/features/users/queries/getUser/getUserQuery.js';
import { GetUserQueryHandler } from '../../../../../src/application/features/users/queries/getUser/getUserQueryHandler.js';
import { GetUserPhoneQuery } from '../../../../../src/application/features/users/queries/getUserPhone/getUserPhoneQuery.js';
import { GetUserPhoneQueryHandler } from '../../../../../src/application/features/users/queries/getUserPhone/getUserPhoneQueryHandler.js';
import type { UsersQueryDependencies } from '../../../../../src/application/features/users/common/usersQueryDependencies.js';
import { contactVersion } from '../../../../../src/domain/users/contactVersion.js';
import { User } from '../../../../../src/domain/users/user.js';
import { Country } from '../../../../../src/domain/countries/country.js';
import { GoalkeeperProfile } from '../../../../../src/domain/goalkeepers/goalkeeperProfile.js';
import { StaffMember } from '../../../../../src/domain/staff/staffMember.js';
import { TermsAcceptance } from '../../../../../src/domain/users/termsAcceptance.js';
import { FakeUserRepository } from '../../../../fakes/fakeUserRepository.js';
import { FakeCountryRepository } from '../../../../fakes/fakeCountryRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { FakeTermsAcceptanceRepository } from '../../../../fakes/fakeTermsAcceptanceRepository.js';
import { FakeDeviceRepository } from '../../../../fakes/fakeDeviceRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../../../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeBookingRepository } from '../../../../fakes/fakeBookingRepository.js';
import { FakeStaffMemberRepository } from '../../../../fakes/fakeStaffMemberRepository.js';
import { FakeUserAdminReader } from '../../../../fakes/fakeUserAdminReader.js';

const T0 = new Date('2026-10-12T15:00:00.000Z');

function user(id: string, email: string, createdAt: string, profile?: [string, string, string]): User {
  const created = User.createFromExternalIdentity({ id, email, displayName: 'Google Name', provider: 'google', subject: `sub-${id}` });
  const dated = new User({ ...created, externalIdentities: created.externalIdentities, createdAt: new Date(createdAt) });
  if (profile) dated.completeProfile(profile[0], profile[1], '+57', profile[2]);
  return dated;
}

describe('user queries (admin spec 005, US1)', () => {
  let deps: UsersQueryDependencies;
  let users: FakeUserRepository;
  let profiles: FakeGoalkeeperProfileRepository;
  let blocks: FakeUserBlockRepository;
  let terms: FakeTermsAcceptanceRepository;
  let devices: FakeDeviceRepository;
  let staff: FakeStaffMemberRepository;

  beforeEach(async () => {
    users = new FakeUserRepository();
    profiles = new FakeGoalkeeperProfileRepository();
    blocks = new FakeUserBlockRepository();
    terms = new FakeTermsAcceptanceRepository();
    devices = new FakeDeviceRepository();
    staff = new FakeStaffMemberRepository();
    const countries = new FakeCountryRepository();
    countries.seed(new Country({ id: 'co', name: 'Colombia', dialCode: '+57', countryCode: 'CO' }));
    const requests = new FakeGoalkeeperRequestRepository();
    const bookings = new FakeBookingRepository();
    deps = {
      users,
      profiles,
      blocks,
      countries,
      staff,
      reader: new FakeUserAdminReader({ users, profiles, blocks, terms, devices, requests, bookings }),
    };
    users.seed(user('u-laura', 'laura@correo.co', '2026-09-01T15:00:00.000Z', ['Laura', 'Gómez', '3001234567']));
    users.seed(user('u-andres', 'andres@correo.co', '2026-10-01T04:30:00.000Z', ['Andrés', 'Ruiz', '3109998877']));
    users.seed(user('u-new', 'new@gmail.com', '2026-10-11T15:00:00.000Z'));
    profiles.seed(new GoalkeeperProfile({
      id: 'gp-1', userId: 'u-andres', documentType: 'CC', documentNumber: '1020304050', issueDate: new Date('2016-01-01'), birthDate: new Date('1998-04-02'),
      documentPhotoAId: 'img-a', documentPhotoBId: 'img-b', heightCm: 186, weightKg: 80, marketId: 'med', zoneIds: ['poblado'], activatedAt: T0,
    }));
  });

  describe('ListUsersQuery', () => {
    it('lists rows with name, country and role, newest first, never the phone', async () => {
      const result = await new ListUsersQueryHandler(deps).handle(new ListUsersQuery({ page: 1, pageSize: 20 }));

      expect(result.totalItems).toBe(3);
      expect(result.items.map((row) => row.id)).toEqual(['u-new', 'u-andres', 'u-laura']);
      expect(result.items[2]).toEqual({
        id: 'u-laura', name: 'Laura Gómez', email: 'laura@correo.co', countryCode: 'CO', createdAt: '2026-09-01T15:00:00.000Z',
        isProfileComplete: true, isGoalkeeper: false, blocked: false,
      });
      expect(result.items[0]).toMatchObject({ name: 'Google Name', countryCode: null, isProfileComplete: false });
      expect(result.items[1]).toMatchObject({ isGoalkeeper: true });
      expect(JSON.stringify(result)).not.toContain('3001234567');
    });

    it('filters by search, role and country', async () => {
      const handler = new ListUsersQueryHandler(deps);

      expect((await handler.handle(new ListUsersQuery({ q: 'gomez', page: 1, pageSize: 20 }))).items.map((row) => row.id)).toEqual(['u-laura']);
      expect((await handler.handle(new ListUsersQuery({ role: 'goalkeeper', page: 1, pageSize: 20 }))).items.map((row) => row.id)).toEqual(['u-andres']);
      expect((await handler.handle(new ListUsersQuery({ countryCode: 'CO', page: 1, pageSize: 20 }))).totalItems).toBe(2);
    });

    it('answers no rows for a country that does not exist', async () => {
      expect(await new ListUsersQueryHandler(deps).handle(new ListUsersQuery({ countryCode: 'ZZ', page: 1, pageSize: 20 }))).toMatchObject({ items: [], totalItems: 0 });
    });

    it('reads the creation dates as whole days in Colombia, both included', async () => {
      // u-andres signed up on 2026-10-01 at 04:30 UTC: 30 September, 11:30 p.m. in Colombia.
      const handler = new ListUsersQueryHandler(deps);
      const only = async (createdFrom: string, createdTo: string) =>
        (await handler.handle(new ListUsersQuery({ createdFrom, createdTo, page: 1, pageSize: 20 }))).items.map((row) => row.id);

      expect(await only('2026-09-30', '2026-09-30')).toEqual(['u-andres']);
      expect(await only('2026-10-01', '2026-10-11')).toEqual(['u-new']);
    });

    it('filters the blocked', async () => {
      await blocks.block('u-laura', 'staff-user', 'Fraude', T0);

      const result = await new ListUsersQueryHandler(deps).handle(new ListUsersQuery({ blocked: true, page: 1, pageSize: 20 }));

      expect(result.items).toEqual([expect.objectContaining({ id: 'u-laura', blocked: true })]);
    });
  });

  describe('GetUserQuery', () => {
    it('answers the detail without the phone, with its version, terms, devices and requests', async () => {
      await terms.add(new TermsAcceptance({ id: 't1', userId: 'u-laura', termsVersion: '2026-08', privacyPolicyVersion: '2026-08', acceptedAt: T0, ipAddress: null, userAgent: null }));
      await devices.upsert('secret-fcm-token', 'u-laura', 'ios', T0);

      const result = await new GetUserQueryHandler(deps).handle(new GetUserQuery('u-laura'));

      expect(result.outcome).toBe('ok');
      if (result.outcome !== 'ok') return;
      expect(result.user).toMatchObject({
        id: 'u-laura', firstName: 'Laura', lastName: 'Gómez', countryCallingCode: '+57', countryCode: 'CO',
        version: contactVersion({ firstName: 'Laura', lastName: 'Gómez', countryCallingCode: '+57', normalizedPhoneNumber: '573001234567' }),
        block: null, terms: [{ version: '2026-08', acceptedAt: T0.toISOString() }], devices: [{ platform: 'ios', lastSeenAt: T0.toISOString() }],
        requestCount: 0,
      });
      expect(JSON.stringify(result)).not.toContain('3001234567');
      expect(JSON.stringify(result)).not.toContain('secret-fcm-token');
    });

    it('names the member who blocked and unblocked the user', async () => {
      await staff.add(StaffMember.rehydrate({ ...StaffMember.invite({ id: 's1', email: 'ana@porteros.pro', roleId: 'owner', invitedBy: 'x' }, T0), userId: 'staff-user', displayName: 'Ana Soporte' }));
      await blocks.block('u-andres', 'staff-user', 'Acoso', T0);
      await blocks.unblock('u-andres', 'someone-gone', 'Revisado', T0);

      const result = await new GetUserQueryHandler(deps).handle(new GetUserQuery('u-andres'));

      expect(result.outcome === 'ok' && result.user.block).toEqual({
        blocked: false, blockedAt: T0.toISOString(), blockedBy: { userId: 'staff-user', name: 'Ana Soporte' }, blockReason: 'Acoso',
        unblockedAt: T0.toISOString(), unblockedBy: { userId: 'someone-gone', name: 'Miembro del equipo' }, unblockReason: 'Revisado',
      });
      expect(result.outcome === 'ok' && result.user.isGoalkeeper).toBe(true);
    });

    it('answers not_found for an unknown user', async () => {
      expect(await new GetUserQueryHandler(deps).handle(new GetUserQuery('nobody'))).toEqual({ outcome: 'not_found' });
    });
  });

  describe('GetUserPhoneQuery', () => {
    it('answers only the calling code and the number', async () => {
      expect(await new GetUserPhoneQueryHandler(deps).handle(new GetUserPhoneQuery('u-laura'))).toEqual({
        outcome: 'ok', phone: { countryCallingCode: '+57', whatsAppNumber: '3001234567' },
      });
    });

    it('answers phone_not_set before the profile is complete, and not_found for nobody', async () => {
      const handler = new GetUserPhoneQueryHandler(deps);

      expect(await handler.handle(new GetUserPhoneQuery('u-new'))).toEqual({ outcome: 'phone_not_set' });
      expect(await handler.handle(new GetUserPhoneQuery('nobody'))).toEqual({ outcome: 'not_found' });
    });
  });
});
