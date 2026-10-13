import { describe, expect, it } from 'vitest';
import { adminGet, adminPost, memberWith, topUpWorld } from '../financeTestHelpers.js';

// Admin spec 007, US1 (FR-006, contracts/finance-api.md §5): "Conciliar ahora".

const answer = (reference: string, status: 'APPROVED' | 'PENDING') => ({ reference, transactionId: `tx-${reference}`, status, amountInCents: 2000000, currency: 'COP' });

describe('admin "Conciliar ahora" (spec 007 of the admin, US1)', () => {
  it('asks the gateway now, credits an approval once and audits it', async () => {
    const { context, owner, topUpId, reference } = await topUpWorld();
    context.paymentGateway.answer(answer(reference, 'APPROVED'));
    context.adminAuditLog.entries.length = 0;

    const response = await adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, owner.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ outcome: 'reconciled', answer: 'APPROVED', status: 'approved', topUp: { topUpId, status: 'approved', checkLog: [{ by: 'staff', answer: 'APPROVED', result: 'applied' }] } });
    expect(context.walletStore.movements().map((movement) => movement.type)).toEqual(['top_up', 'gateway_fee']);
    expect(context.adminAuditLog.entries).toEqual([
      expect.objectContaining({ kind: 'write', action: 'topUp.reconcile', resourceType: 'topUp', resourceId: topUpId, outcome: 'done', permission: 'topups.reconcile' }),
    ]);
    expect(context.adminAuditLog.entries[0]?.after).toMatchObject({ status: 'approved', answer: 'APPROVED' });
    expect(JSON.stringify(context.adminAuditLog.entries[0])).not.toContain(reference);

    const again = await adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, owner.token);
    expect(again.body).toMatchObject({ outcome: 'already_final', status: 'approved' });
    expect(context.adminAuditLog.entries[1]).toMatchObject({ outcome: 'replayed' });
    expect(context.paymentGateway.queries).toHaveLength(1);
    expect(context.walletStore.movements()).toHaveLength(2);
  });

  it('asks once when two members press at the same time', async () => {
    const { context, owner, topUpId, reference } = await topUpWorld();
    context.paymentGateway.answer(answer(reference, 'APPROVED'), answer(reference, 'APPROVED'));

    const [first, second] = await Promise.all([
      adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, owner.token),
      adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, owner.token),
    ]);

    // Whichever arrives second sees the hold (409) or the approval already applied, never a second ask.
    const outcomes = [first, second].map((response) => response.body.outcome ?? response.body.error);
    expect(outcomes).toContain('reconciled');
    expect(outcomes.filter((outcome) => outcome !== 'reconciled')).toEqual([expect.stringMatching(/^(reconcile_in_progress|already_final)$/)]);
    expect(context.paymentGateway.queries).toHaveLength(1);
    expect(context.walletStore.movements()).toHaveLength(2);
  });

  it('says when the gateway does not answer, and keeps the try', async () => {
    const { context, owner, topUpId } = await topUpWorld();
    context.paymentGateway.available = false;

    const response = await adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, owner.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ outcome: 'gateway_unavailable', status: 'pending', topUp: { checkLog: [{ answer: 'UNAVAILABLE' }] } });
  });

  it('refuses when the gateway has no credentials for the country, changing nothing', async () => {
    const { context, owner, topUpId } = await topUpWorld();
    context.paymentSecrets.secrets.clear();

    const response = await adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, owner.token);

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('gateway_unavailable');
    expect((await adminGet(context, `/admin/top-ups/${topUpId}`, owner.token)).body.checkLog).toEqual([]);
  });

  it('answers 404 for an unknown top-up and 403 without topups.reconcile', async () => {
    const { context, owner, topUpId } = await topUpWorld();
    expect((await adminPost(context, '/admin/top-ups/nope/reconcile', owner.token)).status).toBe(404);
    const reader = await memberWith(context, 'finanzas', ['topups.read']);
    const denied = await adminPost(context, `/admin/top-ups/${topUpId}/reconcile`, reader.token);
    expect(denied.status).toBe(403);
    expect(context.paymentGateway.queries).toEqual([]);
  });
});
