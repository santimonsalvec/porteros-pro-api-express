import { describe, expect, it } from 'vitest';
import { checkTopUpWithGateway } from '../../../../../src/application/features/payments/common/checkTopUp.js';
import { GatewayUnavailableError } from '../../../../../src/application/features/payments/common/ports.js';
import { TopUp } from '../../../../../src/domain/payments/topUp.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/walletFixtures.js';
import { PaymentsHarness } from './paymentsHarness.js';

// Admin spec 007 (research §1–§2): one ask to the gateway, shared by the sweep and "Conciliar ahora".

const MINUTE = 60_000;
const SWEEP = { by: 'sweep' as const, staffUserId: null };
const STAFF = { by: 'staff' as const, staffUserId: 'staff-user-1' };

async function setup() {
  const harness = new PaymentsHarness();
  harness.goalkeeper();
  const { topUp } = await harness.start();
  const createdAt = new Date(topUp.createdAt);
  const at = (minutes: number) => {
    harness.clock.set(new Date(createdAt.getTime() + minutes * MINUTE));
    return harness.clock.now();
  };
  const deps = () => ({
    walletContext: harness.wallet.context,
    store: harness.store,
    notices: harness.noticeDeps,
    logger: harness.logger,
    topUpRepository: harness.topUps,
    gateways: harness.gateways,
    secrets: harness.secrets,
    countryLookup: harness.wallet.countries,
  });
  const stored = async () => (await harness.topUps.getById(topUp.topUpId))!;
  const log = () => harness.topUps.checkLogs.get(topUp.topUpId) ?? [];
  return { harness, topUp, at, deps, stored, log };
}

describe('checkTopUpWithGateway', () => {
  it('credits an approval once and keeps what the gateway said', async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    const result = await checkTopUpWithGateway(deps(), await stored(), at(20), STAFF);

    expect(result).toMatchObject({ kind: 'checked', answer: 'APPROVED', result: 'applied', statusAfter: 'approved' });
    expect((await harness.wallet.store.findByGoalkeeperId('gk-1'))?.balance).toBe(18536);
    expect(log()).toEqual([
      { at: at(20), lastAt: at(20), by: 'staff', staffUserId: 'staff-user-1', answer: 'APPROVED', result: 'applied', statusAfter: 'approved', repeats: 1 },
    ]);
  });

  it('keeps a pending answer and, for a member, leaves the sweep schedule alone', async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'PENDING'));
    const before = await stored();

    const result = await checkTopUpWithGateway(deps(), before, at(20), STAFF);

    expect(result).toMatchObject({ kind: 'checked', answer: 'PENDING', result: 'still_pending', statusAfter: 'pending' });
    expect(await stored()).toMatchObject({ checks: before.checks, nextCheckAt: before.nextCheckAt, lastCheckedAt: before.lastCheckedAt });
    expect(log()).toHaveLength(1);
  });

  it('schedules the next ask for the sweep, as before', async () => {
    const { harness, topUp, at, deps, stored } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'PENDING'));

    const result = await checkTopUpWithGateway(deps(), await stored(), at(15), SWEEP);

    expect(result).toMatchObject({ kind: 'checked', result: 'still_pending', job: 'rescheduled' });
    expect(await stored()).toMatchObject({ checks: 1, nextCheckAt: new Date(new Date(topUp.createdAt).getTime() + 60 * MINUTE) });
  });

  it('calls a missing transaction NOT_FOUND', async () => {
    const { at, deps, stored, log } = await setup();

    await checkTopUpWithGateway(deps(), await stored(), at(20), STAFF);

    expect(log()[0]).toMatchObject({ answer: 'NOT_FOUND', result: 'still_pending' });
  });

  it('records a gateway that does not answer and lets the error through', async () => {
    const { harness, at, deps, stored, log } = await setup();
    harness.gateway.available = false;

    await expect(checkTopUpWithGateway(deps(), await stored(), at(20), STAFF)).rejects.toBeInstanceOf(GatewayUnavailableError);
    expect(log()[0]).toMatchObject({ answer: 'UNAVAILABLE', result: 'failed', statusAfter: 'pending' });
    expect(harness.topUps.leases.size).toBe(0);
  });

  it('records missing secrets and lets the error through, without asking', async () => {
    const { harness, at, deps, stored, log } = await setup();
    harness.secrets.secrets.clear();

    await expect(checkTopUpWithGateway(deps(), await stored(), at(20), SWEEP)).rejects.toThrow(/secrets are not available/);
    expect(harness.gateway.queries).toEqual([]);
    expect(log()[0]).toMatchObject({ answer: 'MISSING_SECRETS', result: 'failed' });
  });

  it('keeps a charge of another amount uncredited', async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED', 999));

    await checkTopUpWithGateway(deps(), await stored(), at(20), STAFF);

    expect(log()[0]).toMatchObject({ answer: 'APPROVED', result: 'mismatch', statusAfter: 'pending' });
    expect(harness.wallet.store.movements()).toHaveLength(0);
  });

  it('credits a late approval of an expired top-up when a member asks', async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    harness.topUps.put(TopUp.rehydrate({ ...(await stored()).toProps(), status: 'expired', nextCheckAt: null }));
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    await checkTopUpWithGateway(deps(), await stored(), at(3000), STAFF);

    expect((await stored()).status).toBe('approved');
    expect(log()[0]).toMatchObject({ result: 'applied', statusAfter: 'approved' });
  });

  it('does not ask while another ask holds the top-up', async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    await harness.topUps.acquireCheckLease(topUp.topUpId, at(20));

    expect(await checkTopUpWithGateway(deps(), await stored(), at(20), STAFF)).toEqual({ kind: 'busy' });
    expect(harness.gateway.queries).toEqual([]);
    expect(log()).toEqual([]);
  });

  it('folds equal failures in a row into one entry', async () => {
    const { harness, at, deps, stored, log } = await setup();
    harness.gateway.available = false;

    await checkTopUpWithGateway(deps(), await stored(), at(15), SWEEP).catch(() => undefined);
    await checkTopUpWithGateway(deps(), await stored(), at(16), SWEEP).catch(() => undefined);

    expect(log()).toEqual([expect.objectContaining({ answer: 'UNAVAILABLE', at: at(15), lastAt: at(16), repeats: 2 })]);
  });

  it('records an unexpected gateway error as ERROR and lets it through', async () => {
    const { harness, at, deps, stored, log } = await setup();
    harness.gateway.findByReference = async () => {
      throw new Error('unexpected');
    };

    await expect(checkTopUpWithGateway(deps(), await stored(), at(20), STAFF)).rejects.toThrow('unexpected');
    expect(log()[0]).toMatchObject({ answer: 'ERROR', result: 'failed' });
  });

  it("records a failure to credit (the wallet can't be resolved) and lets it through", async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));
    harness.wallet.profiles.seed(buildGoalkeeperProfile('gk-1', { cityId: 'city-orphan' }));

    await expect(checkTopUpWithGateway(deps(), await stored(), at(20), STAFF)).rejects.toThrow();
    expect(log()[0]).toMatchObject({ answer: 'APPROVED', result: 'failed', statusAfter: 'pending' });
  });

  it('records an answer the store already applied as unchanged', async () => {
    const { harness, topUp, at, deps, stored, log } = await setup();
    const before = await stored();
    await harness.deliver(harness.event(topUp.reference, 'APPROVED'));
    harness.gateway.answer(harness.answer(topUp.reference, 'APPROVED'));

    const result = await checkTopUpWithGateway(deps(), before, at(20), SWEEP);

    expect(result).toMatchObject({ kind: 'checked', result: 'unchanged', statusAfter: 'approved', job: 'rescheduled' });
    expect(log()[0]).toMatchObject({ result: 'unchanged' });
  });

  it('expires a top-up the sweep finds still pending at 48 hours', async () => {
    const { at, deps, stored, log } = await setup();

    const result = await checkTopUpWithGateway(deps(), await stored(), at(2880), SWEEP);

    expect(result).toMatchObject({ result: 'expired', job: 'expired', statusAfter: 'expired' });
    expect(log()[0]).toMatchObject({ answer: 'NOT_FOUND', result: 'expired' });
  });
});
