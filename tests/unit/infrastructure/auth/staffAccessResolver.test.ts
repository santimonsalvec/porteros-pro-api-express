import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffAccessResolver } from '../../../../src/infrastructure/auth/staffAccessResolver.js';
import { AdminSession } from '../../../../src/domain/staff/adminSession.js';
import { StaffMember } from '../../../../src/domain/staff/staffMember.js';
import { StaffRole } from '../../../../src/domain/staff/staffRole.js';
import { PERMISSION_CATALOG } from '../../../../src/domain/staff/permissionCatalog.js';
import { FakeAdminSessionStore } from '../../../fakes/fakeAdminSessionStore.js';
import { FakeStaffMemberRepository } from '../../../fakes/fakeStaffMemberRepository.js';
import { FakeStaffRoleRepository } from '../../../fakes/fakeStaffRoleRepository.js';
import { FixedClock } from '../../../fakes/fakeClock.js';

const NOW = '2026-10-08T14:00:00.000Z';
const SECOND = 1000;

describe('StaffAccessResolver', () => {
  let sessions: FakeAdminSessionStore;
  let members: FakeStaffMemberRepository;
  let roles: FakeStaffRoleRepository;
  let clock: FixedClock;
  let resolver: StaffAccessResolver;

  beforeEach(async () => {
    sessions = new FakeAdminSessionStore();
    members = new FakeStaffMemberRepository();
    roles = new FakeStaffRoleRepository();
    clock = new FixedClock(NOW);
    resolver = new StaffAccessResolver(sessions, members, roles, clock);
    await roles.upsert(StaffRole.create({ id: 'soporte', name: 'Soporte', description: '', permissions: ['cases.read'] }, clock.now()));
    await roles.ensureOwner(clock.now());
    await members.add(
      StaffMember.invite({ id: 'staff-1', email: 'ana@example.com', roleId: 'soporte', invitedBy: 'x' }, clock.now()).activate('user-1', 'Ana', clock.now()),
    );
    await sessions.add(AdminSession.start({ id: 'sid-1', staffId: 'staff-1', userId: 'user-1', refreshTokenHash: 'h1', userAgent: '', ip: '' }, clock.now()));
  });

  it("resolves a valid session to its member, role and effective permissions", async () => {
    const access = await resolver.resolve('sid-1');

    expect(access).toMatchObject({ isOwner: false, permissions: ['cases.read'] });
    expect(access?.member.id).toBe('staff-1');
    expect(access?.role.id).toBe('soporte');
  });

  it('gives an owner the whole catalog', async () => {
    await members.update((await members.getById('staff-1'))!.changeRole('owner', clock.now()));

    expect(await resolver.resolve('sid-1')).toMatchObject({ isOwner: true, permissions: [...PERMISSION_CATALOG] });
  });

  it('is null for an unknown, revoked or expired session, or a member without access', async () => {
    expect(await resolver.resolve('missing')).toBeNull();

    await sessions.update((await sessions.getById('sid-1'))!.revoke('sign_out', clock.now()));
    expect(await resolver.resolve('sid-1')).toBeNull();
  });

  it('is null once the session goes idle, even when cached', async () => {
    expect(await resolver.resolve('sid-1')).not.toBeNull();

    clock.advance(30 * 60 * SECOND);

    expect(await resolver.resolve('sid-1')).toBeNull();
  });

  it('is null for a disabled member', async () => {
    await members.update((await members.getById('staff-1'))!.disable(clock.now()));

    expect(await resolver.resolve('sid-1')).toBeNull();
  });

  it('caches for 30 seconds, then reads again', async () => {
    const getById = vi.spyOn(sessions, 'getById');
    await resolver.resolve('sid-1');
    await members.update((await members.getById('staff-1'))!.disable(clock.now()));

    clock.advance(29 * SECOND);
    expect(await resolver.resolve('sid-1')).not.toBeNull();
    expect(getById).toHaveBeenCalledTimes(1);

    clock.advance(1 * SECOND);
    expect(await resolver.resolve('sid-1')).toBeNull();
    expect(getById).toHaveBeenCalledTimes(2);
  });

  it('invalidate forgets one session or all of them at once', async () => {
    await resolver.resolve('sid-1');
    await members.update((await members.getById('staff-1'))!.disable(clock.now()));

    resolver.invalidate('sid-1');
    expect(await resolver.resolve('sid-1')).toBeNull();

    await members.update((await members.getById('staff-1'))!.enable(clock.now()));
    await resolver.resolve('sid-1');
    await members.update((await members.getById('staff-1'))!.disable(clock.now()));
    resolver.invalidate();
    expect(await resolver.resolve('sid-1')).toBeNull();
  });
});
