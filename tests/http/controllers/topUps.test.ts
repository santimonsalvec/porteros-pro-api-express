import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, TEST_INTERNAL_TOKEN, TEST_PAYMENTS_BASE_URL } from '../testAppFactory.js';
import { signInClient, signInGoalkeeper, type TestApp } from '../walletTestHelpers.js';
import { signedEvent } from '../../fakes/fakePaymentGateway.js';
import { TEST_GATEWAY_SECRETS } from '../../fakes/fakePaymentSecrets.js';

function api(context: TestApp, token: string) {
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${token}`);
  return {
    options: () => auth(request(context.app).get('/goalkeepers/me/wallet/top-up-options')),
    start: (body: unknown) => auth(request(context.app).post('/goalkeepers/me/wallet/top-ups').send(body as object)),
    acceptTerms: () => auth(request(context.app).post('/profile/terms/accept')),
  };
}

/** A goalkeeper of Cali with Colombia's Wompi settings configured (the profile completion accepted terms 1.0). */
async function goalkeeperWithGateway(context: TestApp, sub = 'sub-2201') {
  context.paymentGatewaySettingsRepository.seed();
  return signInGoalkeeper(context, sub);
}

describe('Wallet top-ups — US1: the goalkeeper starts a top-up', () => {
  it('lists the amounts with their cost and net', async () => {
    const context = await buildTestApp();
    const { token } = await goalkeeperWithGateway(context);

    const response = await api(context, token).options();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ available: true, gateway: 'wompi', currency: 'COP', termsAccepted: true, termsVersion: '1.0' });
    expect(response.body.options).toHaveLength(5);
    expect(response.body.options[1]).toEqual({ amount: 20000, cost: 1464, net: 18536 });
  });

  it('shows top-ups unavailable where no gateway is configured', async () => {
    const context = await buildTestApp();
    const { token } = await signInGoalkeeper(context, 'sub-2202');

    const options = await api(context, token).options();
    const start = await api(context, token).start({ amount: 20000 });

    expect(options.body).toMatchObject({ available: false, gateway: null, options: [] });
    expect(start.status).toBe(409);
    expect(start.body.error).toBe('top_ups_unavailable');
  });

  it('requires the current terms, accepted through POST /profile/terms/accept, then answers the signed checkout', async () => {
    const context = await buildTestApp();
    const { token, userId } = await goalkeeperWithGateway(context);
    // The terms accepted at sign-up are dropped, as if a new version were published.
    context.termsAcceptanceRepository.records.splice(0);

    const refused = await api(context, token).start({ amount: 20000 });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: 'terms_not_accepted', termsVersion: '1.0' });

    const accepted = await api(context, token).acceptTerms();
    expect(accepted.status).toBe(201);
    expect(accepted.body).toEqual({ termsVersion: '1.0', privacyPolicyVersion: '1.0', acceptedAt: context.clock.now().toISOString() });

    const started = await api(context, token).start({ amount: 20000 });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ status: 'pending', amount: 20000, cost: 1464, net: 18536, currency: 'COP', finalizedAt: null });
    expect(started.body.reference).toMatch(/^PPR-/);
    expect(started.body.checkoutUrl).toMatch(/^https:\/\/checkout\.wompi\.co\/p\/\?/);
    const redirect = new URL(started.body.checkoutUrl as string).searchParams.get('redirect-url');
    expect(redirect).toBe(`${TEST_PAYMENTS_BASE_URL}/pagos/retorno/${started.body.reference}`);
    expect(context.topUpRepository.all()).toMatchObject([{ goalkeeperId: userId, status: 'pending' }]);
  });

  it.each([
    [{ amount: 15000 }, 'invalid_amount'],
    [{ amount: 20000.5 }, 'validation_failed'],
    [{ amount: '20000' }, 'validation_failed'],
    [{}, 'validation_failed'],
  ])('400 for %j', async (body, code) => {
    const context = await buildTestApp();
    const { token } = await goalkeeperWithGateway(context);

    const response = await api(context, token).start(body);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(code);
    expect(context.topUpRepository.all()).toEqual([]);
  });

  it('503 when the gateway secrets are missing', async () => {
    const context = await buildTestApp();
    const { token } = await goalkeeperWithGateway(context);
    context.paymentSecrets.secrets.clear();

    const response = await api(context, token).start({ amount: 20000 });

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('gateway_unavailable');
  });

  it('404 for a signed-in user who is not a goalkeeper, and 401 without a token', async () => {
    const context = await buildTestApp();
    context.paymentGatewaySettingsRepository.seed();
    const { token } = await signInClient(context, 'sub-2203');

    expect((await api(context, token).options()).status).toBe(404);
    expect((await api(context, token).start({ amount: 20000 })).status).toBe(404);
    expect((await request(context.app).get('/goalkeepers/me/wallet/top-up-options')).status).toBe(401);
    expect((await request(context.app).post('/profile/terms/accept')).status).toBe(401);
  });
});

/** Starts a 20 000 top-up through the API and returns its reference and id. */
async function startedTopUp(context: TestApp, sub = 'sub-2211') {
  const goalkeeper = await goalkeeperWithGateway(context, sub);
  const started = await api(context, goalkeeper.token).start({ amount: 20000 });
  if (started.status !== 201) throw new Error(`start failed: ${started.status}`);
  return { ...goalkeeper, reference: started.body.reference as string, topUpId: started.body.topUpId as string };
}

function approvedEvent(reference: string, status = 'APPROVED', secret = TEST_GATEWAY_SECRETS.eventsSecret) {
  return signedEvent({ id: `tx-${reference}`, reference, amount_in_cents: 2000000, currency: 'COP', status }, secret);
}

function deliver(context: TestApp, body: unknown) {
  return request(context.app).post('/webhooks/payments/wompi').send(body as object);
}

describe('POST /webhooks/payments/wompi — US2: an approved payment credits exactly once', () => {
  it('credits the net once, lists top_up and gateway_fee, and notifies the goalkeeper', async () => {
    const context = await buildTestApp();
    const { token, userId, reference } = await startedTopUp(context);
    const event = approvedEvent(reference);

    const first = await deliver(context, event).set('X-Event-Checksum', event.signature.checksum);
    const repeat = await deliver(context, event);

    expect(first.status).toBe(200);
    expect(repeat.status).toBe(200);
    const wallet = await request(context.app).get('/goalkeepers/me/wallet').set('Authorization', `Bearer ${token}`);
    expect(wallet.body.balance).toBe(18536);
    const movements = await request(context.app).get('/goalkeepers/me/wallet/movements').set('Authorization', `Bearer ${token}`);
    expect(movements.body.items.map((item: { type: string; amount: number }) => [item.type, item.amount])).toEqual([
      ['gateway_fee', -1464],
      ['top_up', 20000],
    ]);
    expect(context.notificationRepository.all().filter((n) => n.userId === userId)).toMatchObject([{ type: 'wallet.top_up_approved' }]);
  });

  it('answers 200 to a forged event and changes nothing', async () => {
    const context = await buildTestApp();
    const { token, reference } = await startedTopUp(context);

    const response = await deliver(context, approvedEvent(reference, 'APPROVED', 'test_events_guess'));

    expect(response.status).toBe(200);
    const wallet = await request(context.app).get('/goalkeepers/me/wallet').set('Authorization', `Bearer ${token}`);
    expect(wallet.body.balance).toBe(0);
    expect(context.topUpRepository.all()[0]?.status).toBe('pending');
  });

  it('answers 200 to an unknown reference or a body that is not an event', async () => {
    const context = await buildTestApp();

    expect((await deliver(context, approvedEvent('PPR-unknown'))).status).toBe(200);
    expect((await deliver(context, { nothing: true })).status).toBe(200);
  });

  it('answers 500 on an internal failure, so the gateway retries', async () => {
    const context = await buildTestApp();
    const { reference } = await startedTopUp(context);
    context.paymentSecrets.secrets.clear();

    expect((await deliver(context, approvedEvent(reference))).status).toBe(500);
  });

  it('records a decline without crediting and tells the goalkeeper', async () => {
    const context = await buildTestApp();
    const { userId, reference } = await startedTopUp(context);

    await deliver(context, approvedEvent(reference, 'DECLINED'));

    expect(context.topUpRepository.all()[0]?.status).toBe('declined');
    expect(context.walletStore.movements()).toEqual([]);
    expect(context.notificationRepository.all().filter((n) => n.userId === userId)).toMatchObject([{ type: 'wallet.top_up_failed' }]);
  });
});

describe('POST /internal/sweep — US3: a lost confirmation is reconciled', () => {
  it('asks the gateway 15 minutes later and credits the approval once', async () => {
    const context = await buildTestApp();
    const { token, reference } = await startedTopUp(context);
    context.paymentGateway.answer({ reference, transactionId: 'tx-1', status: 'APPROVED', amountInCents: 2000000, currency: 'COP' });
    context.clock.advance(16 * 60_000);

    const sweep = await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);
    const again = await request(context.app).post('/internal/sweep').set('Authorization', `Bearer ${TEST_INTERNAL_TOKEN}`);

    expect(sweep.status).toBe(200);
    expect(again.status).toBe(200);
    const wallet = await request(context.app).get('/goalkeepers/me/wallet').set('Authorization', `Bearer ${token}`);
    expect(wallet.body.balance).toBe(18536);
    expect(context.paymentGateway.queries).toEqual([{ reference, environment: 'sandbox' }]);
  });
});

describe('GET /goalkeepers/me/wallet/top-ups — US4: the goalkeeper sees their top-ups', () => {
  it('lists an approved and a declined top-up, newest first, and reads one', async () => {
    const context = await buildTestApp();
    const { token, reference: first, topUpId } = await startedTopUp(context);
    await deliver(context, approvedEvent(first));
    context.clock.advance(60_000);
    const second = await api(context, token).start({ amount: 10000 });
    await deliver(
      context,
      signedEvent({ id: 'tx-2', reference: second.body.reference, amount_in_cents: 1000000, currency: 'COP', status: 'DECLINED' }, TEST_GATEWAY_SECRETS.eventsSecret),
    );

    const list = await request(context.app).get('/goalkeepers/me/wallet/top-ups?page=1&pageSize=10').set('Authorization', `Bearer ${token}`);
    const one = await request(context.app).get(`/goalkeepers/me/wallet/top-ups/${topUpId}`).set('Authorization', `Bearer ${token}`);

    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 10, totalItems: 2, totalPages: 1 });
    expect(list.body.items.map((item: { status: string; amount: number }) => [item.status, item.amount])).toEqual([
      ['declined', 10000],
      ['approved', 20000],
    ]);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ topUpId, status: 'approved', net: 18536 });
    expect(one.body.finalizedAt).toEqual(expect.any(String));
  });

  it('404 for another goalkeeper\'s top-up, and 400 for a bad page', async () => {
    const context = await buildTestApp();
    const { topUpId } = await startedTopUp(context);
    const other = await signInGoalkeeper(context, 'sub-2212');

    const response = await request(context.app).get(`/goalkeepers/me/wallet/top-ups/${topUpId}`).set('Authorization', `Bearer ${other.token}`);
    const badPage = await request(context.app).get('/goalkeepers/me/wallet/top-ups?page=0').set('Authorization', `Bearer ${other.token}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('top_up_not_found');
    expect(badPage.status).toBe(400);
  });
});
