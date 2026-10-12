import { describe, expect, it } from 'vitest';
import { User } from '../../../src/domain/users/user.js';
import { TermsAcceptance } from '../../../src/domain/users/termsAcceptance.js';
import { FakeUserRepository } from '../../fakes/fakeUserRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeUserBlockRepository } from '../../fakes/fakeUserBlockRepository.js';
import { FakeTermsAcceptanceRepository } from '../../fakes/fakeTermsAcceptanceRepository.js';
import { FakeDeviceRepository } from '../../fakes/fakeDeviceRepository.js';
import { FakeGoalkeeperRequestRepository } from '../../fakes/fakeGoalkeeperRequestRepository.js';
import { FakeBookingRepository } from '../../fakes/fakeBookingRepository.js';
import { FakeUserAdminReader } from '../../fakes/fakeUserAdminReader.js';
import { FakeGoalkeeperAdminReader } from '../../fakes/fakeGoalkeeperAdminReader.js';
import type { FakeWalletStore } from '../../fakes/fakeWalletStore.js';
import type { FakeBookingLifecycleStore } from '../../fakes/fakeBookingLifecycleStore.js';
import { buildGoalkeeperProfile } from '../../fixtures/walletFixtures.js';
import { buildBooking } from '../../fixtures/offerFixtures.js';
import { buildRequest } from '../../fixtures/quoteFixtures.js';

const NOW = new Date('2026-10-12T15:00:00.000Z');

/** The in-memory readers must filter like the Mongo ones, or the HTTP tests would prove nothing. */
describe('the admin reader fakes (admin spec 005)', () => {
  function users() {
    const repository = new FakeUserRepository();
    for (const [id, name, created] of [['u1', 'Ana', '2026-10-01T15:00:00.000Z'], ['u2', 'Beto', '2026-10-05T15:00:00.000Z']] as const) {
      const user = User.createFromExternalIdentity({ id, email: `${id}@x.co`, displayName: null, provider: 'google', subject: id });
      const dated = new User({ ...user, externalIdentities: user.externalIdentities, createdAt: new Date(created) });
      dated.completeProfile(name, 'Ruiz', '+57', `300000000${id.slice(1)}`);
      repository.seed(dated);
    }
    return repository;
  }

  it('the user reader filters by every criterion, pages, and reads terms, devices and requests', async () => {
    const userRepository = users();
    const profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(buildGoalkeeperProfile('u2'));
    const blocks = new FakeUserBlockRepository();
    await blocks.block('u1', 's', 'x', NOW);
    const terms = new FakeTermsAcceptanceRepository();
    await terms.add(new TermsAcceptance({ id: 't1', userId: 'u1', termsVersion: 'v1', privacyPolicyVersion: 'v1', acceptedAt: new Date('2026-10-01'), ipAddress: null, userAgent: null }));
    await terms.add(new TermsAcceptance({ id: 't2', userId: 'u1', termsVersion: 'v2', privacyPolicyVersion: 'v2', acceptedAt: new Date('2026-10-02'), ipAddress: null, userAgent: null }));
    const devices = new FakeDeviceRepository();
    await devices.upsert('t-a', 'u1', 'ios', new Date('2026-10-01'));
    await devices.upsert('t-b', 'u1', 'android', new Date('2026-10-03'));
    const requests = new FakeGoalkeeperRequestRepository();
    const later = new Date('2026-10-13T00:00:00.000Z');
    requests.seed(buildRequest('r-open', later, { clientId: 'u1' }));
    requests.seed(buildRequest('r-done', later, { clientId: 'u1' }));
    const bookings = new FakeBookingRepository();
    bookings.seed(buildBooking({ id: 'b-open', requestId: 'r-open', status: 'pending_assignment' }));
    bookings.seed(buildBooking({ id: 'b-done', requestId: 'r-done', status: 'cancelled' }));
    const reader = new FakeUserAdminReader({ users: userRepository, profiles, blocks, terms, devices, requests, bookings });
    const ids = async (filter: Parameters<typeof reader.list>[0]) => (await reader.list(filter)).items.map((item) => item.id);

    expect(await ids({ page: 1, pageSize: 20 })).toEqual(['u2', 'u1']);
    expect(await ids({ page: 2, pageSize: 1 })).toEqual(['u1']);
    expect(await ids({ role: 'client', page: 1, pageSize: 20 })).toEqual(['u1']);
    expect(await ids({ countryCallingCode: '+1', page: 1, pageSize: 20 })).toEqual([]);
    expect(await ids({ createdFrom: new Date('2026-10-03'), page: 1, pageSize: 20 })).toEqual(['u2']);
    expect(await ids({ createdTo: new Date('2026-10-03'), page: 1, pageSize: 20 })).toEqual(['u1']);
    expect(await ids({ blocked: true, page: 1, pageSize: 20 })).toEqual(['u1']);
    expect(await reader.findIds('beto', 5)).toEqual(['u2']);
    expect((await reader.terms('u1')).map((term) => term.version)).toEqual(['v2', 'v1']);
    expect((await reader.devices('u1')).map((device) => device.platform)).toEqual(['android', 'ios']);
    expect(await reader.requestCount('u1')).toBe(2);
    expect(await reader.openRequests('u1', NOW, 5)).toMatchObject({ total: 1, items: [{ id: 'r-open' }] });
  });

  it('the goalkeeper reader filters by every criterion, and averages, counts and lists', async () => {
    const profiles = new FakeGoalkeeperProfileRepository();
    profiles.seed(buildGoalkeeperProfile('g1', { cityId: 'med', zoneIds: ['z1'], suspendedUntil: new Date('2026-10-20'), availableForOffers: false }));
    profiles.seed(buildGoalkeeperProfile('g2', { cityId: 'cali', zoneIds: ['z2'] }));
    const wallets = { wallets: () => [{ goalkeeperId: 'g2', balance: 50000, currency: 'COP' }] } as unknown as FakeWalletStore;
    const bookings = new FakeBookingRepository();
    bookings.seed(buildBooking({ id: 'b2', goalkeeperId: 'g1', status: 'assigned', assignedAt: NOW, startsAt: new Date('2026-10-14T00:00:00.000Z') }));
    bookings.seed(buildBooking({ id: 'b1', goalkeeperId: 'g1', status: 'assigned', assignedAt: NOW, startsAt: new Date('2026-10-13T00:00:00.000Z') }));
    const lifecycle = {
      ratings: () => [{ subjectId: 'g1', side: 'client', stars: 5 }, { subjectId: 'g1', side: 'client', stars: 4 }, { subjectId: 'g1', side: 'goalkeeper', stars: 1 }],
      incidents: () => [{ goalkeeperId: 'g1', kind: 'withdrawal' }, { goalkeeperId: 'g1', kind: 'no_show' }, { goalkeeperId: 'g2', kind: 'no_show' }],
    } as unknown as FakeBookingLifecycleStore;
    const reader = new FakeGoalkeeperAdminReader({ profiles, wallets, lifecycle, bookings });
    const ids = async (filter: Partial<Parameters<typeof reader.list>[0]>) => (await reader.list({ now: NOW, page: 1, pageSize: 20, ...filter })).items.map((item) => item.userId).sort();

    expect(await ids({})).toEqual(['g1', 'g2']);
    expect(await ids({ userIds: ['g2'] })).toEqual(['g2']);
    expect(await ids({ cityId: 'med' })).toEqual(['g1']);
    expect(await ids({ zoneId: 'z2' })).toEqual(['g2']);
    expect(await ids({ suspended: true })).toEqual(['g1']);
    expect(await ids({ availableForOffers: true })).toEqual(['g2']);
    expect(await ids({ balanceBelow: 1 })).toEqual(['g1']);
    expect(await reader.ratingsFor(['g1', 'g2'])).toEqual(new Map([['g1', { average: 4.5, count: 2 }]]));
    expect(await reader.incidentCounts('g1')).toEqual({ withdrawal: 1, no_show: 1 });
    expect(await reader.upcomingBookings('g1', NOW, 1)).toMatchObject({ total: 2, items: [{ id: 'b1' }] });
  });
});
