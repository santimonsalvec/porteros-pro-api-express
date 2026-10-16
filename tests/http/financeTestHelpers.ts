import request from 'supertest';
import { expect } from 'vitest';
import { buildTestApp } from './testAppFactory.js';
import { seedRole, signInStaff } from './adminTestHelpers.js';
import { signInGoalkeeper, type TestApp } from './operatingBalanceTestHelpers.js';
import { buildDocument } from '../fixtures/invoicingAdminFixtures.js';

/** A GET as a member (or anonymous without a token), optionally with an `X-Scope` (spec 031). */
export const adminGet = (context: TestApp, path: string, token?: string, scope?: string) => {
  const req = request(context.app).get(path);
  const withScope = scope ? req.set('X-Scope', scope) : req;
  return token ? withScope.set('Authorization', `Bearer ${token}`) : withScope;
};

export const adminPost = (context: TestApp, path: string, token: string, body: object = {}) =>
  request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body);

export const adminPut = (context: TestApp, path: string, token: string, body: object) =>
  request(context.app).put(path).set('Authorization', `Bearer ${token}`).send(body);

/** A member with only `permissions`. */
export async function memberWith(context: TestApp, key: string, permissions: string[]) {
  await seedRole(context, key, permissions);
  return signInStaff(context, { key, userId: `${key}-user`, roleId: key });
}

/**
 * Admin spec 007: Colombia's Wompi settings, a goalkeeper of Cali with one pending deposit of 20 000
 * (cost 1 464, net 18 536) started through the app, and the owner signed in to the admin.
 */
export async function depositWorld() {
  const context = await buildTestApp();
  context.paymentGatewaySettingsRepository.seed();
  const goalkeeper = await signInGoalkeeper(context, 'sub-7001');
  const started = await request(context.app).post('/goalkeepers/me/operating-balance/deposits').set('Authorization', `Bearer ${goalkeeper.token}`).send({ amount: 20000 });
  expect(started.status).toBe(201);
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, goalkeeper, owner, depositId: started.body.depositId as string, reference: started.body.reference as string };
}

/**
 * Admin spec 007, US2: an issued invoice of 7 000 + 1 330 (FE-1024, with its PDF), its credit note
 * still pending, and a rejected invoice (no DANE codes); the owner signed in.
 */
export async function documentWorld() {
  const context = await buildTestApp();
  context.clock.set('2026-10-15T14:00:00.000Z');
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  const issued = buildDocument({
    id: 'inv-1',
    status: 'issued',
    provider: { name: 'siigo', config: {}, id: 's-1', number: 'FE-1024', cufe: 'cufe-1' },
    issuedAt: new Date('2026-10-13T14:05:00.000Z'),
  });
  const note = buildDocument({ id: 'nc-1', kind: 'credit_note', originalDocumentId: 'inv-1', createdAt: new Date('2026-10-13T15:00:00.000Z'), occurredAt: new Date('2026-10-13T15:00:00.000Z') });
  const rejected = buildDocument({
    id: 'rej-1',
    status: 'rejected',
    createdAt: new Date('2026-10-14T10:00:00.000Z'),
    occurredAt: new Date('2026-10-14T10:00:00.000Z'),
    lastError: { kind: 'rejected', code: 'buyer_city_not_coded', message: 'The city has no DANE codes', at: new Date('2026-10-14T10:01:00.000Z') },
  });
  for (const document of [issued, note, rejected]) context.invoicingDocumentRepository.put(document);
  context.invoicingProvider.files.set('s-1:pdf', { content: Buffer.from('%PDF-1.7 Juan 1020304050'), contentType: 'application/pdf', fileName: 'FE-1024.pdf' });
  return { context, owner };
}
