import { beforeEach, describe, expect, it } from 'vitest';
import { CancelAccountClosureCommand } from '../../../../../src/application/features/accountClosures/commands/cancelAccountClosure/cancelAccountClosureCommand.js';
import { CancelAccountClosureCommandHandler } from '../../../../../src/application/features/accountClosures/commands/cancelAccountClosure/cancelAccountClosureCommandHandler.js';
import { RequestAccountClosureCommand } from '../../../../../src/application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommand.js';
import { RequestAccountClosureCommandHandler } from '../../../../../src/application/features/accountClosures/commands/requestAccountClosure/requestAccountClosureCommandHandler.js';
import { GetMyAccountClosureQuery } from '../../../../../src/application/features/accountClosures/queries/getMyAccountClosure/getMyAccountClosureQuery.js';
import { GetMyAccountClosureQueryHandler } from '../../../../../src/application/features/accountClosures/queries/getMyAccountClosure/getMyAccountClosureQueryHandler.js';
import { ClosureHarness } from './closureHarness.js';

let h: ClosureHarness;
let request: RequestAccountClosureCommandHandler;
let cancel: CancelAccountClosureCommandHandler;
let read: GetMyAccountClosureQueryHandler;

beforeEach(() => {
  h = new ClosureHarness();
  request = new RequestAccountClosureCommandHandler(h.deps);
  cancel = new CancelAccountClosureCommandHandler(h.deps);
  read = new GetMyAccountClosureQueryHandler(h.deps);
});

const ASSIGNED = { code: 'assigned_bookings', bookingId: 'b-1', startsAtLocal: '2026-10-18T19:00:00-05:00', placeName: 'Cancha La 70' } as const;

describe('requesting the closure of an account (feature 029, US4)', () => {
  it('opens the request with the balance at that moment and turns the offers off', async () => {
    await h.goalkeeper('gk-1', 13000);

    const result = await request.handle(new RequestAccountClosureCommand('gk-1'));

    expect(result).toMatchObject({ outcome: 'requested', current: { status: 'requested', balance: 13000, currency: 'COP', refundAmount: 13000, debtToCover: null } });
    const stored = await h.closures.findOpenByUserId('gk-1');
    expect(stored).toMatchObject({ role: 'goalkeeper', balanceAtRequest: 13000, status: 'requested' });
    expect((await h.world.profiles.getByUserId('gk-1'))?.availableForOffers).toBe(false);
  });

  it('tells the user once, with an inbox entry', async () => {
    await h.goalkeeper('gk-1', 13000);
    await request.handle(new RequestAccountClosureCommand('gk-1'));

    const notices = await h.payments.notifications.listForUser('gk-1', 0, 10);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ type: 'account_closure.requested', title: 'Recibimos tu solicitud de cierre' });
  });

  it('is refused while the goalkeeper has matches to play, and lists them', async () => {
    await h.goalkeeper('gk-1', 13000);
    h.blockers.byUser.set('gk-1', [ASSIGNED, { code: 'pending_deposits', depositId: 'd-1', amount: 20000, currency: 'COP' }]);

    const result = await request.handle(new RequestAccountClosureCommand('gk-1'));

    expect(result).toEqual({ outcome: 'blocked', blockers: [ASSIGNED] });
    expect(await h.closures.findOpenByUserId('gk-1')).toBeNull();
    expect((await h.world.profiles.getByUserId('gk-1'))?.availableForOffers).toBe(true);
  });

  it('answers the open request when it is asked twice', async () => {
    await h.goalkeeper('gk-1', 13000);
    const first = await request.handle(new RequestAccountClosureCommand('gk-1'));
    const second = await request.handle(new RequestAccountClosureCommand('gk-1'));

    expect(second).toMatchObject({ outcome: 'already_open' });
    expect(second.outcome === 'already_open' && first.outcome === 'requested' && second.current.closureId === first.current.closureId).toBe(true);
    expect(h.closures.closures.size).toBe(1);
  });

  it('lets a client close with no balance at all', async () => {
    const result = await request.handle(new RequestAccountClosureCommand('client-1'));

    expect(result).toMatchObject({ outcome: 'requested', current: { balance: null, currency: null, refundAmount: null } });
    expect(await h.closures.findOpenByUserId('client-1')).toMatchObject({ role: 'client', balanceAtRequest: null });
  });

  it('records a debt as such', async () => {
    await h.goalkeeper('gk-1', -30000);
    h.suggested = 40000;

    const result = await request.handle(new RequestAccountClosureCommand('gk-1'));

    expect(result).toMatchObject({ outcome: 'requested', current: { balance: -30000, refundAmount: 0, debtToCover: 30000 } });
  });
});

describe('reading my closure', () => {
  it('shows what a new request would look like when none is open', async () => {
    await h.goalkeeper('gk-1', 13000);
    h.blockers.byUser.set('gk-1', [ASSIGNED]);

    expect(await read.handle(new GetMyAccountClosureQuery('gk-1'))).toEqual({
      outcome: 'ok',
      current: null,
      preview: { canRequest: false, balance: 13000, currency: 'COP', refundAmount: 13000, hasDebt: false, blockers: [ASSIGNED] },
    });
  });

  it('can be requested when nothing blocks it', async () => {
    await h.goalkeeper('gk-1', 0);
    const result = await read.handle(new GetMyAccountClosureQuery('gk-1'));
    expect(result).toMatchObject({ preview: { canRequest: true, blockers: [] } });
  });

  it('shows the open request with the live balance and the suggested deposit for a debt', async () => {
    await h.goalkeeper('gk-1', -30000);
    await request.handle(new RequestAccountClosureCommand('gk-1'));

    const result = await read.handle(new GetMyAccountClosureQuery('gk-1'));

    expect(result).toMatchObject({
      current: { status: 'requested', balance: -30000, debtToCover: 30000, suggestedDepositAmount: 40000, debtResolution: null },
      preview: null,
    });
  });
});

describe('cancelling my request', () => {
  it('ends it and keeps the offers off for the goalkeeper to turn on again', async () => {
    await h.goalkeeper('gk-1', 13000);
    await request.handle(new RequestAccountClosureCommand('gk-1'));

    const result = await cancel.handle(new CancelAccountClosureCommand('gk-1'));

    expect(result).toMatchObject({ outcome: 'cancelled', current: { status: 'cancelled' } });
    expect(await h.closures.findOpenByUserId('gk-1')).toBeNull();
  });

  it('answers not_found with nothing open', async () => {
    expect(await cancel.handle(new CancelAccountClosureCommand('gk-1'))).toEqual({ outcome: 'not_found' });
  });

  it('is refused once the refund was recorded', async () => {
    await h.goalkeeper('gk-1', 0);
    await request.handle(new RequestAccountClosureCommand('gk-1'));
    const open = (await h.closures.findOpenByUserId('gk-1'))!;
    const recorded = open.recordRefund({ by: 'admin-1', now: new Date(), amount: 0, reference: null, paidOn: null, note: null, movementId: null });
    if (recorded.ok) await h.closures.save(recorded.closure, 'requested');

    expect(await cancel.handle(new CancelAccountClosureCommand('gk-1'))).toEqual({ outcome: 'not_cancellable' });
  });

  it('is refused when an administrator acted first', async () => {
    await h.goalkeeper('gk-1', 13000);
    await request.handle(new RequestAccountClosureCommand('gk-1'));
    h.closures.failNextSave = true;

    expect(await cancel.handle(new CancelAccountClosureCommand('gk-1'))).toEqual({ outcome: 'not_cancellable' });
  });
});
