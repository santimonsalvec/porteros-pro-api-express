import { describe, expect, it } from 'vitest';
import {
  COLLECTION_RENAMES,
  OBSOLETE_JOB_LOCKS,
  mentionsOldTerm,
  rewriteAuditEntry,
  rewriteMovement,
  rewriteNotification,
  rewriteStaffRole,
  totalsOf,
  verifyTotals,
} from '../../../scripts/lib/migrate029.js';

describe('migration 029: operating balance vocabulary', () => {
  it('renames the three collections', () => {
    expect(COLLECTION_RENAMES).toEqual([
      { from: 'wallets', to: 'operatingBalances' },
      { from: 'walletMovements', to: 'balanceMovements' },
      { from: 'topUps', to: 'deposits' },
    ]);
  });

  it('drops the old reconcile job lock, which only holds a lease', () => {
    expect(OBSOLETE_JOB_LOCKS).toEqual(['top-up-reconcile']);
  });

  describe('rewriteMovement', () => {
    const topUp = {
      _id: 'm1',
      walletId: 'g1',
      sequence: 1,
      type: 'top_up',
      amount: 20000,
      balanceAfter: 20000,
      causeKey: 'top_up:t1',
      references: { topUpId: 't1' },
      reason: null,
    };

    it('renames the owner field, the type, the cause key and the reference', () => {
      expect(rewriteMovement(topUp)).toEqual({
        _id: 'm1',
        operatingBalanceId: 'g1',
        sequence: 1,
        type: 'deposit',
        amount: 20000,
        balanceAfter: 20000,
        causeKey: 'deposit:t1',
        references: { depositId: 't1' },
        reason: null,
      });
    });

    it('never touches an amount, a sequence or a balance', () => {
      const out = rewriteMovement(topUp);
      expect([out.amount, out.sequence, out.balanceAfter]).toEqual([20000, 1, 20000]);
    });

    it('leaves the other movement types and their cause keys alone', () => {
      const charge = { _id: 'm2', walletId: 'g1', type: 'commission_charge', causeKey: 'commission:b1', references: { bookingId: 'b1' } };
      expect(rewriteMovement(charge)).toEqual({
        _id: 'm2',
        operatingBalanceId: 'g1',
        type: 'commission_charge',
        causeKey: 'commission:b1',
        references: { bookingId: 'b1' },
      });
    });

    it('is idempotent', () => {
      const once = rewriteMovement(topUp);
      expect(rewriteMovement(once)).toEqual(once);
    });
  });

  describe('rewriteNotification', () => {
    it('renames the type and the deposit id of a top-up notice', () => {
      expect(
        rewriteNotification({ _id: 'n1', type: 'wallet.top_up_approved', data: { type: 'wallet.top_up_approved', topUpId: 't1' } }),
      ).toEqual({ _id: 'n1', type: 'operating_balance.deposit_approved', data: { type: 'operating_balance.deposit_approved', depositId: 't1' } });
    });

    it('renames failed and adjusted notices', () => {
      expect(rewriteNotification({ type: 'wallet.top_up_failed', data: { type: 'wallet.top_up_failed', topUpId: 't2' } })).toEqual({
        type: 'operating_balance.deposit_failed',
        data: { type: 'operating_balance.deposit_failed', depositId: 't2' },
      });
      expect(rewriteNotification({ type: 'wallet.adjusted', data: { type: 'wallet.adjusted' } })).toEqual({
        type: 'operating_balance.adjusted',
        data: { type: 'operating_balance.adjusted' },
      });
    });

    it('leaves other notices alone and is idempotent', () => {
      const offer = { type: 'offer', data: { bookingId: 'b1' } };
      expect(rewriteNotification(offer)).toEqual(offer);
      const once = rewriteNotification({ type: 'wallet.adjusted', data: { type: 'wallet.adjusted' } });
      expect(rewriteNotification(once)).toEqual(once);
    });
  });

  describe('rewriteStaffRole', () => {
    it('renames the four permissions and keeps the others', () => {
      const role = { _id: 'r1', permissions: ['wallets.read', 'wallets.adjust', 'topups.read', 'topups.reconcile', 'users.read'] };
      expect(rewriteStaffRole(role)).toEqual({
        _id: 'r1',
        permissions: ['operating_balances.read', 'operating_balances.adjust', 'deposits.read', 'deposits.reconcile', 'users.read'],
      });
    });

    it('is idempotent', () => {
      const once = rewriteStaffRole({ permissions: ['wallets.read'] });
      expect(rewriteStaffRole(once)).toEqual(once);
    });
  });

  describe('rewriteAuditEntry', () => {
    it('renames the three admin actions', () => {
      expect(rewriteAuditEntry({ action: 'wallet.adjust' }).action).toBe('operating_balance.adjust');
      expect(rewriteAuditEntry({ action: 'topUp.reconcile' }).action).toBe('deposit.reconcile');
      expect(rewriteAuditEntry({ action: 'topUps.export' }).action).toBe('deposits.export');
    });

    it('renames the resource type of those entries too', () => {
      expect(rewriteAuditEntry({ action: 'wallet.adjust', resourceType: 'wallet' })).toEqual({ action: 'operating_balance.adjust', resourceType: 'operatingBalance' });
      expect(rewriteAuditEntry({ action: 'topUp.reconcile', resourceType: 'topUp' })).toEqual({ action: 'deposit.reconcile', resourceType: 'deposit' });
      expect(rewriteAuditEntry({ action: 'topUps.export', resourceType: 'topUps' })).toEqual({ action: 'deposits.export', resourceType: 'deposits' });
    });

    it('leaves other actions alone, and is idempotent', () => {
      const other = { action: 'paymentGatewaySettings.update', resourceType: 'paymentGatewaySettings' };
      expect(rewriteAuditEntry(other)).toEqual(other);
      const once = rewriteAuditEntry({ action: 'wallet.adjust', resourceType: 'wallet' });
      expect(rewriteAuditEntry(once)).toEqual(once);
    });
  });

  describe('verifyTotals', () => {
    const balances = [
      { _id: 'g1', balance: 5000 },
      { _id: 'g2', balance: -2000 },
    ];
    const movements = [
      { walletId: 'g1', amount: 20000 },
      { walletId: 'g1', amount: -15000 },
      { walletId: 'g2', amount: -2000 },
    ];

    it('sums the movements per balance and overall', () => {
      expect(totalsOf(balances, movements)).toEqual({
        balanceCount: 2,
        movementCount: 3,
        movementSum: 3000,
        perBalance: { g1: { balance: 5000, movements: 5000 }, g2: { balance: -2000, movements: -2000 } },
      });
    });

    it('accepts an identical before and after, and a balance equal to its movements', () => {
      const before = totalsOf(balances, movements);
      expect(verifyTotals(before, totalsOf(balances, movements))).toEqual([]);
    });

    it('reports a changed count, a changed sum and a balance that no longer equals its movements', () => {
      const before = totalsOf(balances, movements);
      const lost = totalsOf(balances, movements.slice(1));
      const problems = verifyTotals(before, lost);
      expect(problems).toContain('movementCount: 3 → 2');
      expect(problems).toContain('movementSum: 3000 → -17000');
      expect(problems.some((problem) => problem.includes('g1'))).toBe(true);
    });

    it('reports a balance that did not equal its movements before the migration', () => {
      const broken = totalsOf([{ _id: 'g1', balance: 999 }], [{ walletId: 'g1', amount: 100 }]);
      expect(verifyTotals(broken, broken).some((problem) => problem.includes('g1'))).toBe(true);
    });
  });

  describe('mentionsOldTerm', () => {
    it('finds a leftover in any nested value', () => {
      expect(mentionsOldTerm({ payload: { note: 'top_up:abc' } })).toBe(true);
      expect(mentionsOldTerm({ type: 'wallet.adjusted' })).toBe(true);
      expect(mentionsOldTerm({ type: 'offer', data: { bookingId: 'b1' } })).toBe(false);
    });
  });
});
