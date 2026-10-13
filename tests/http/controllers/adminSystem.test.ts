import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Country } from '../../../src/domain/countries/country.js';
import type { DomainEvent } from '../../../src/domain/events/domainEvent.js';
import { adminGet, memberWith } from '../financeTestHelpers.js';
import { TEST_SYSTEM_ENV, buildTestApp } from '../testAppFactory.js';
import { signInClient } from '../walletTestHelpers.js';

// Admin spec 008, US3 (contracts/dashboard-system-api.md §2–§4).

const event = (id: string): DomainEvent => ({
  id,
  type: 'goalkeeper.assigned',
  version: 1,
  occurredAt: new Date(),
  bookingId: `bk-${id}`,
  requestId: 'rq-1',
  payload: { clientPhone: '+573001234567' },
});

async function world() {
  const context = await buildTestApp();
  const tecnico = await memberWith(context, 'tecnico', ['system.read']);
  return { context, tecnico };
}

describe('the admin system routes (spec 008 of the admin, US3)', () => {
  it.each(['/admin/system/health', '/admin/system/events', '/admin/system/jobs', '/admin/system/parameters'])('%s refuses without a session, with an app token and without system.read', async (path) => {
    const { context } = await world();
    const client = await signInClient(context, 'sub-8101');
    const other = await memberWith(context, 'panel', ['dashboard.read']);
    expect((await adminGet(context, path)).status).toBe(401);
    expect((await adminGet(context, path, client.token)).status).toBe(401);
    expect((await adminGet(context, path, other.token)).status).toBe(403);
    expect(context.adminAuditLog.entries).toContainEqual(expect.objectContaining({ outcome: 'denied', permission: 'system.read' }));
  });

  it('answers the health as data, also when unhealthy, while /health keeps its 503', async () => {
    const { context, tecnico } = await world();
    context.health.status = 'Unhealthy';
    context.health.checks = [{ name: 'mongodb', status: 'Unhealthy' }];

    const response = await adminGet(context, '/admin/system/health', tecnico.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'Unhealthy', checks: [{ name: 'mongodb', status: 'Unhealthy' }], checkedAt: expect.any(String) });
    expect((await request(context.app).get('/health')).status).toBe(503);
  });

  it('lists the pending events with their marks and never their payload', async () => {
    const { context, tecnico } = await world();
    context.outboxStore.append([event('evt-1')], new Date(context.clock.now().getTime() - 10 * 60_000));
    context.outboxStore.pending()[0]!.attempts = 3;
    context.outboxStore.append([event('evt-2')], context.clock.now());
    context.adminAuditLog.entries.length = 0;

    const response = await adminGet(context, '/admin/system/events', tecnico.token);

    expect(response.status).toBe(200);
    expect(response.body.pending).toMatchObject({ count: 2, retriedCount: 1 });
    expect(response.body.stuckAfterMinutes).toBe(5);
    expect(response.body.page.items.map((item: { id: string; retried: boolean; stuck: boolean }) => [item.id, item.retried, item.stuck])).toEqual([
      ['evt-1', true, true],
      ['evt-2', false, false],
    ]);
    expect(JSON.stringify(response.body)).not.toContain('payload');
    expect(JSON.stringify(response.body)).not.toContain('3001234567');
    expect((await adminGet(context, '/admin/system/events?retried=true', tecnico.token)).body.page.items).toHaveLength(1);
    expect(context.adminAuditLog.entries).toEqual([]);
  });

  it('refuses malformed event filters', async () => {
    const { context, tecnico } = await world();
    for (const query of ['retried=yes', 'pageSize=500', 'page=0', 'color=red']) {
      expect((await adminGet(context, `/admin/system/events?${query}`, tecnico.token)).status, query).toBe(400);
    }
    expect((await adminGet(context, '/admin/system/jobs?color=red', tecnico.token)).status).toBe(400);
  });

  it("shows the sweep's jobs, in its order, with the ones that never ran as late", async () => {
    const { context, tecnico } = await world();
    await context.jobLockStore.tryAcquire('booking-expiry', context.clock.now(), 55);

    const response = await adminGet(context, '/admin/system/jobs', tecnico.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ lateAfterMinutes: 5, sweepLate: false });
    const expiry = response.body.jobs.find((job: { name: string }) => job.name === 'booking-expiry');
    expect(expiry).toMatchObject({ running: true, late: false, leaseSeconds: 55 });
    expect(response.body.jobs.filter((job: { late: boolean }) => job.late).length).toBe(response.body.jobs.length - 1);
  });

  it('shows the parameters and whether each secret is there, never a secret', async () => {
    const { context, tecnico } = await world();
    context.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
    context.paymentGatewaySettingsRepository.seed();

    const response = await adminGet(context, '/admin/system/parameters', tecnico.token);

    expect(response.status).toBe(200);
    expect(response.body.values).toContainEqual({ name: 'LEGAL_TERMS_VERSION', value: '1.2', isDefault: false });
    expect(response.body.values).toContainEqual({ name: 'OFFER_MAX_REMINDERS', value: 3, isDefault: true });
    expect(response.body.secrets).toEqual([
      { name: 'MONGODB_CONNECTION_STRING', present: true },
      { name: 'JWT_SIGNING_KEY', present: true },
      { name: 'CLOUDINARY_URL', present: false },
    ]);
    expect(response.body.countryCredentials).toEqual([
      { countryId: 'country-co', countryCode: 'CO', countryName: 'Colombia', gateway: { name: 'wompi', present: true }, invoicingProvider: null },
    ]);
    const answer = JSON.stringify(response.body);
    expect(answer).not.toContain('TestOnlyPass42');
    expect(answer).not.toContain('test-only-signing-key');
    expect(answer).not.toContain(TEST_SYSTEM_ENV.MONGODB_CONNECTION_STRING);
  });
});
