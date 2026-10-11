import { QUOTE_FORMAT_FIELDS } from '../fixtures/quoteFixtures.js';
import request from 'supertest';
import type { buildTestApp } from './testAppFactory.js';
import { ExternalIdentity } from '../../src/domain/users/externalIdentity.js';
import { buildGoalkeeperProfile, COLOMBIA_INVOICING } from '../fixtures/walletFixtures.js';
import type { LedgerOwner } from '../../src/application/features/wallet/common/walletLedger.js';
import { signInStaff } from './adminTestHelpers.js';

export type TestApp = Awaited<ReturnType<typeof buildTestApp>>;

/** Signs in and completes the client profile; returns the token and the user id. */
export async function signInClient(context: TestApp, sub: string): Promise<{ token: string; userId: string }> {
  context.googleValidator.registerValidCredential(`cred-${sub}`, new ExternalIdentity('google', sub, `${sub}@example.com`));
  const exchange = await request(context.app)
    .post('/auth/sso/exchange')
    .send({ provider: 'google', platform: 'mobile', credential: `cred-${sub}` });
  const completion = await request(context.app)
    .post('/profile/complete')
    .set('Authorization', `Bearer ${exchange.body.accessToken}`)
    .send({ firstName: 'Ana', lastName: 'Portera', countryCode: 'CO', whatsAppNumber: `300 000 ${sub.slice(-4).padStart(4, '0')}`, acceptedTerms: true });
  const token = completion.body.accessToken as string;
  const me = await request(context.app).get('/auth/me').set('Authorization', `Bearer ${token}`);
  return { token, userId: me.body.userId as string };
}

/** A signed-in client who is also an active goalkeeper of Cali with the given zones. */
export async function signInGoalkeeper(context: TestApp, sub: string, zoneIds = ['zone-cali-norte']) {
  const client = await signInClient(context, sub);
  context.goalkeeperProfileRepository.seed(buildGoalkeeperProfile(client.userId, { zoneIds }));
  return client;
}

/** An owner's admin web access token (spec 001: staff member + `POST /auth/admin/sign-in`). */
export async function signInAdmin(context: TestApp): Promise<{ token: string; userId: string }> {
  const owner = await signInStaff(context, { key: 'admin', userId: 'admin-1' });
  return { token: owner.token, userId: owner.userId };
}

export function ownerOf(goalkeeperId: string): LedgerOwner {
  return { goalkeeperId, currency: 'COP', invoicing: COLOMBIA_INVOICING };
}

/** 13:30 in Bogotá: a quote for 15:00 local (20:00Z) has 90 minutes of notice and its search ends at 19:30Z. */
export const MATCH_NOW = '2026-09-21T18:30:00.000Z';

/**
 * As a signed-in client, quotes and confirms a match in Cali Norte (15:00 local, 90 min) through
 * the real HTTP flow; returns the confirmation body (request with its bookings).
 */
export async function createRequestAsClient(
  context: TestApp,
  token: string,
  overrides: { goalkeeperCount?: 1 | 2; startsAt?: string } = {},
) {
  const quote = await request(context.app)
    .post('/goalkeeper-requests/quote')
    .set('Authorization', `Bearer ${token}`)
    .send({
      latitude: 3.45,
      longitude: -76.5,
      startsAt: overrides.startsAt ?? '2026-09-21T15:00:00',
      goalkeeperCount: overrides.goalkeeperCount ?? 2,
      durationMinutes: 90,
      ...QUOTE_FORMAT_FIELDS,
    });
  if (quote.status !== 200) throw new Error(`quote failed: ${quote.status} ${JSON.stringify(quote.body)}`);
  const confirmation = await request(context.app)
    .post('/goalkeeper-requests/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ quoteId: quote.body.quoteId });
  if (confirmation.status !== 201) throw new Error(`confirmation failed: ${confirmation.status}`);
  return confirmation.body as { requestId: string; bookings: { bookingId: string }[] };
}
