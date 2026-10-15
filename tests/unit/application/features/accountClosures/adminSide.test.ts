import { beforeEach, describe, expect, it } from 'vitest';
import { CloseAccountCommand } from '../../../../../src/application/features/accountClosures/commands/closeAccount/closeAccountCommand.js';
import { CloseAccountCommandHandler } from '../../../../../src/application/features/accountClosures/commands/closeAccount/closeAccountCommandHandler.js';
import { RecordClosureRefundCommand } from '../../../../../src/application/features/accountClosures/commands/recordClosureRefund/recordClosureRefundCommand.js';
import { RecordClosureRefundCommandHandler } from '../../../../../src/application/features/accountClosures/commands/recordClosureRefund/recordClosureRefundCommandHandler.js';
import { RejectAccountClosureCommand } from '../../../../../src/application/features/accountClosures/commands/rejectAccountClosure/rejectAccountClosureCommand.js';
import { RejectAccountClosureCommandHandler } from '../../../../../src/application/features/accountClosures/commands/rejectAccountClosure/rejectAccountClosureCommandHandler.js';
import { RequestAccountClosureCommand } from '../../../../../src/application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommand.js';
import { RequestAccountClosureCommandHandler } from '../../../../../src/application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommandHandler.js';
import { ResolveClosureDebtCommand } from '../../../../../src/application/features/accountClosures/commands/resolveClosureDebt/resolveClosureDebtCommand.js';
import { ResolveClosureDebtCommandHandler } from '../../../../../src/application/features/accountClosures/commands/resolveClosureDebt/resolveClosureDebtCommandHandler.js';
import { GetAccountClosureAdminQuery } from '../../../../../src/application/features/accountClosures/queries/getAccountClosureAdmin/getAccountClosureAdminQuery.js';
import { GetAccountClosureAdminQueryHandler } from '../../../../../src/application/features/accountClosures/queries/getAccountClosureAdmin/getAccountClosureAdminQueryHandler.js';
import { ListAccountClosuresAdminQuery } from '../../../../../src/application/features/accountClosures/queries/listAccountClosuresAdmin/listAccountClosuresAdminQuery.js';
import { ListAccountClosuresAdminQueryHandler } from '../../../../../src/application/features/accountClosures/queries/listAccountClosuresAdmin/listAccountClosuresAdminQueryHandler.js';
import { User } from '../../../../../src/domain/users/user.js';
import { ClosureHarness } from './closureHarness.js';

let h: ClosureHarness;
const requestClosure = (userId: string) => new RequestAccountClosureCommandHandler(h.deps).handle(new RequestAccountClosureCommand(userId));
const detail = (id: string) => new GetAccountClosureAdminQueryHandler(h.deps).handle(new GetAccountClosureAdminQuery(id));
const debt = (id: string, resolution: 'deposit_required' | 'waived', reason: string | null = null) =>
  new ResolveClosureDebtCommandHandler(h.deps).handle(new ResolveClosureDebtCommand('admin-1', id, resolution, reason));
const refund = (id: string, amount: number, extra: { reference?: string | null; paidOn?: string | null; note?: string | null } = {}) =>
  new RecordClosureRefundCommandHandler(h.deps).handle(
    new RecordClosureRefundCommand('admin-1', id, amount, extra.reference === undefined ? 'TRX-1' : extra.reference, extra.paidOn === undefined ? '2026-10-15' : extra.paidOn, extra.note ?? null),
  );
const close = (id: string) => new CloseAccountCommandHandler(h.deps).handle(new CloseAccountCommand('admin-1', id));
const reject = (id: string, reason: string) => new RejectAccountClosureCommandHandler(h.deps).handle(new RejectAccountClosureCommand('admin-1', id, reason));

async function requested(userId: string, balance: number): Promise<string> {
  await h.goalkeeper(userId, balance);
  const result = await requestClosure(userId);
  if (result.outcome !== 'requested') throw new Error('expected a request');
  return result.current.closureId;
}

const balanceOf = async (userId: string) => (await h.world.store.findByGoalkeeperId(userId))?.balance ?? 0;
const user = (id: string, firstName: string, email: string) =>
  new User({ id, email, displayName: null, isAdmin: false, externalIdentities: [], createdAt: new Date(), firstName, lastName: 'Gómez', countryCallingCode: '+57', whatsAppNumber: '3001234567', isProfileComplete: true, normalizedPhoneNumber: '573001234567' });

beforeEach(() => {
  h = new ClosureHarness();
});

describe('the administrators’ list of closures', () => {
  it('lists the open requests by default, newest first, with the user', async () => {
    h.users.seed(user('gk-1', 'Laura', 'laura@example.com'));
    h.users.seed(user('gk-2', 'Diego', 'diego@example.com'));
    await requested('gk-1', 13000);
    await requested('gk-2', -5000);
    const handler = new ListAccountClosuresAdminQueryHandler(h.deps);

    const result = await handler.handle(new ListAccountClosuresAdminQuery({ statuses: ['requested', 'refund_recorded'], q: null, debt: null, page: 1, pageSize: 20 }));

    expect(result.page.totalItems).toBe(2);
    expect(result.page.items.map((item) => item.user)).toEqual(expect.arrayContaining([
      { userId: 'gk-1', name: 'Laura Gómez', email: 'laura@example.com', role: 'goalkeeper' },
    ]));
    expect(result.page.items.find((item) => item.user.userId === 'gk-2')).toMatchObject({ hasDebt: true, balanceAtRequest: -5000 });
  });

  it('filters by the people a search finds, and by debt', async () => {
    await requested('gk-1', 13000);
    await requested('gk-2', -5000);
    h.searchResults.set('laura', ['gk-1']);
    const handler = new ListAccountClosuresAdminQueryHandler(h.deps);

    const byName = await handler.handle(new ListAccountClosuresAdminQuery({ statuses: ['requested'], q: 'laura', debt: null, page: 1, pageSize: 20 }));
    const byDebt = await handler.handle(new ListAccountClosuresAdminQuery({ statuses: ['requested'], q: null, debt: 'with', page: 1, pageSize: 20 }));

    expect(byName.page.items.map((item) => item.user.userId)).toEqual(['gk-1']);
    expect(byDebt.page.items.map((item) => item.user.userId)).toEqual(['gk-2']);
  });
});

describe('the detail of a closure', () => {
  it('shows the balance now, what blocks the refund and what may be done', async () => {
    const id = await requested('gk-1', 13000);
    h.blockers.byUser.set('gk-1', [{ code: 'pending_deposits', depositId: 'd-1', amount: 20000, currency: 'COP' }]);

    expect(await detail(id)).toMatchObject({
      outcome: 'ok',
      detail: { closureId: id, status: 'requested', balance: 13000, refundAmount: 13000, hasDebt: false, allowedActions: ['reject'], blockers: [{ code: 'pending_deposits' }] },
    });
  });

  it('offers the refund once nothing blocks it', async () => {
    const id = await requested('gk-1', 13000);
    expect(await detail(id)).toMatchObject({ detail: { allowedActions: ['refund', 'reject'] } });
  });

  it('answers not_found', async () => {
    expect(await detail('nope')).toEqual({ outcome: 'not_found' });
  });
});

describe('resolving a debt', () => {
  it('asks for a deposit: the status stays and the user is told what to cover', async () => {
    const id = await requested('gk-1', -30000);

    const result = await debt(id, 'deposit_required');

    expect(result).toMatchObject({ outcome: 'ok', detail: { status: 'requested', debtResolution: 'deposit_required', allowedActions: ['waive_debt', 'reject'] } });
    const notices = await h.payments.notifications.listForUser('gk-1', 0, 10);
    expect(notices.find((notice) => notice.type === 'account_closure.debt_deposit_required')?.body).toBe('Deposita 30.000 COP para cubrir tu saldo operativo negativo.');
    expect(await debt(id, 'deposit_required')).toMatchObject({ outcome: 'replayed' });
  });

  it('waives it with a reason: a debt waiver movement leaves the balance at zero', async () => {
    const id = await requested('gk-1', -30000);

    const result = await debt(id, 'waived', 'Error de cobro');

    expect(result).toMatchObject({ outcome: 'ok', detail: { debtResolution: 'waived', balance: 0, allowedActions: ['refund', 'reject'] } });
    expect(await balanceOf('gk-1')).toBe(0);
    expect(h.world.store.movements().find((movement) => movement.type === 'debt_waiver')).toMatchObject({ amount: 30000, reason: 'Error de cobro', references: { closureId: id } });
    expect(await debt(id, 'waived', 'Error de cobro')).toMatchObject({ outcome: 'replayed' });
    expect(h.world.store.movements().filter((movement) => movement.type === 'debt_waiver')).toHaveLength(1);
  });

  it('refuses to waive without a reason', async () => {
    const id = await requested('gk-1', -30000);
    expect(await debt(id, 'waived', ' ')).toMatchObject({ outcome: 'validation_failed', fieldErrors: { reason: expect.any(String) } });
    expect(await balanceOf('gk-1')).toBe(-30000);
  });

  it('is not applicable with a balance that is not negative', async () => {
    const id = await requested('gk-1', 13000);
    expect(await debt(id, 'waived', 'Error de cobro')).toEqual({ outcome: 'debt_not_applicable' });
    expect(await debt(id, 'deposit_required')).toEqual({ outcome: 'debt_not_applicable' });
  });
});

describe('recording the refund', () => {
  it('returns the balance with the proof, leaving it at zero, and tells the user', async () => {
    const id = await requested('gk-1', 13000);

    const result = await refund(id, 13000, { note: 'Bancolombia' });

    expect(result).toMatchObject({
      outcome: 'ok',
      detail: { status: 'refund_recorded', balance: 0, refund: { amount: 13000, reference: 'TRX-1', paidOn: '2026-10-15', note: 'Bancolombia', recordedBy: 'admin-1' }, allowedActions: ['close'] },
    });
    expect(await balanceOf('gk-1')).toBe(0);
    expect(h.world.store.movements().find((movement) => movement.type === 'closure_refund')).toMatchObject({ amount: -13000, references: { closureId: id } });
    const notices = await h.payments.notifications.listForUser('gk-1', 0, 10);
    expect(notices.find((notice) => notice.type === 'account_closure.refund_recorded')?.body).toBe('Te devolvimos 13.000 COP de tu saldo operativo.');
  });

  it('refuses an amount that is not the balance', async () => {
    const id = await requested('gk-1', 13000);
    expect(await refund(id, 10000)).toEqual({ outcome: 'refund_amount_mismatch', balance: 13000 });
    expect(await balanceOf('gk-1')).toBe(13000);
  });

  it('refuses while the balance is negative', async () => {
    const id = await requested('gk-1', -5000);
    expect(await refund(id, 0, { reference: null, paidOn: null })).toEqual({ outcome: 'debt_pending', balance: -5000 });
  });

  it('refuses while something blocks it', async () => {
    const id = await requested('gk-1', 13000);
    h.blockers.byUser.set('gk-1', [{ code: 'open_cases', caseId: 'case-1', type: 'goalkeeper_no_show' }]);
    expect(await refund(id, 13000)).toMatchObject({ outcome: 'closure_blockers_pending', blockers: [{ code: 'open_cases' }] });
    expect(await balanceOf('gk-1')).toBe(13000);
  });

  it('needs the reference and the date when money is returned', async () => {
    const id = await requested('gk-1', 13000);
    expect(await refund(id, 13000, { reference: null, paidOn: null })).toMatchObject({ outcome: 'validation_failed', fieldErrors: { reference: expect.any(String), paidOn: expect.any(String) } });
    expect(await refund(id, 13000, { paidOn: 'ayer' })).toMatchObject({ outcome: 'validation_failed', fieldErrors: { paidOn: expect.any(String) } });
  });

  it('records a zero refund with no proof and no movement', async () => {
    const id = await requested('gk-1', 0);

    const result = await refund(id, 0, { reference: null, paidOn: null });

    expect(result).toMatchObject({ outcome: 'ok', detail: { status: 'refund_recorded', refund: { amount: 0, reference: null } } });
    expect(h.world.store.movements().some((movement) => movement.type === 'closure_refund')).toBe(false);
    const notices = await h.payments.notifications.listForUser('gk-1', 0, 10);
    expect(notices.find((notice) => notice.type === 'account_closure.refund_recorded')?.body).toBe('No había saldo para devolver.');
  });

  it('finishes after a failure between the movement and the status: the same amount, once', async () => {
    const id = await requested('gk-1', 13000);
    await h.world.ledger.refundClosure(h.world.owner('gk-1'), { closureId: id, amount: 13000, adminUserId: 'admin-1' });
    expect(await balanceOf('gk-1')).toBe(0);

    const result = await refund(id, 13000);

    expect(result).toMatchObject({ outcome: 'ok', detail: { status: 'refund_recorded', refund: { amount: 13000 } } });
    expect(h.world.store.movements().filter((movement) => movement.type === 'closure_refund')).toHaveLength(1);
  });

  it('is refused for a request that is not open for it', async () => {
    const id = await requested('gk-1', 0);
    await reject(id, 'Tiene deuda con soporte');
    expect(await refund(id, 0, { reference: null, paidOn: null })).toEqual({ outcome: 'invalid_transition' });
  });
});

describe('closing the account', () => {
  it('closes it after the refund, tells the user and removes their devices', async () => {
    const id = await requested('gk-1', 13000);
    await h.payments.devices.upsert('tok-1', 'gk-1', 'ios', new Date());
    await refund(id, 13000);

    const result = await close(id);

    expect(result).toMatchObject({ outcome: 'ok', detail: { status: 'closed', allowedActions: [] } });
    expect(await h.closures.findClosedByUserId('gk-1')).not.toBeNull();
    expect(await h.closures.findOpenByUserId('gk-1')).toBeNull();
    const notices = await h.payments.notifications.listForUser('gk-1', 0, 10);
    expect(notices.some((notice) => notice.type === 'account_closure.closed')).toBe(true);
    expect(await h.payments.devices.findByUserIds(['gk-1'])).toEqual([]);
  });

  it('is refused before the refund, and answers the same when repeated', async () => {
    const id = await requested('gk-1', 0);
    expect(await close(id)).toEqual({ outcome: 'invalid_transition' });
    await refund(id, 0, { reference: null, paidOn: null });
    await close(id);
    expect(await close(id)).toMatchObject({ outcome: 'replayed' });
  });
});

describe('rejecting the request', () => {
  it('puts the account back, with the reason told to the user', async () => {
    const id = await requested('gk-1', 13000);

    const result = await reject(id, 'Tienes un caso abierto');

    expect(result).toMatchObject({ outcome: 'ok', detail: { status: 'rejected', endReason: 'Tienes un caso abierto' } });
    expect(await h.closures.findOpenByUserId('gk-1')).toBeNull();
    const notices = await h.payments.notifications.listForUser('gk-1', 0, 10);
    expect(notices.find((notice) => notice.type === 'account_closure.rejected')?.body).toBe('Tienes un caso abierto');
  });

  it('needs a reason and refuses after the refund', async () => {
    const id = await requested('gk-1', 0);
    expect(await reject(id, 'x')).toMatchObject({ outcome: 'validation_failed', fieldErrors: { reason: expect.any(String) } });
    await refund(id, 0, { reference: null, paidOn: null });
    expect(await reject(id, 'Tienes un caso abierto')).toEqual({ outcome: 'invalid_transition' });
  });
});
