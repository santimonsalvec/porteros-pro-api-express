import { describe, expect, it } from 'vitest';
import { commissionRefundDraft } from '../../../../../src/application/features/wallet/common/walletLedger.js';
import { assertMovementShape } from '../../../../../src/domain/wallet/walletMovement.js';

const owner = { goalkeeperId: 'gk-1', currency: 'COP', invoicing: { documentType: 'CC', documentNumber: '1' } };
const at = new Date('2026-10-04T19:00:00.000Z');

describe('commissionRefundDraft', () => {
  it('gives back the amount with the same cause key as refundCommission, and the cancellation details', () => {
    const draft = commissionRefundDraft(
      owner,
      { bookingId: 'b-1', requestId: 'r-1', amount: 7000, cancellation: { by: 'system', at, reason: 'cancel_all' } },
      'm-1',
      at,
    );

    expect(draft).toEqual({
      id: 'm-1',
      goalkeeperId: 'gk-1',
      type: 'commission_refund',
      amount: 7000,
      currency: 'COP',
      occurredAt: at,
      causeKey: 'commission_refund:b-1',
      actor: { kind: 'system', userId: null },
      references: { bookingId: 'b-1', requestId: 'r-1' },
      cancellation: { by: 'system', at, reason: 'cancel_all' },
      reason: null,
      invoicing: owner.invoicing,
    });
    expect(() => assertMovementShape(draft)).not.toThrow();
  });
});
