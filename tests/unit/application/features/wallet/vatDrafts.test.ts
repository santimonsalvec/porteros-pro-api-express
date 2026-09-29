import { describe, expect, it } from 'vitest';
import { commissionVatDraft, penaltyChargeDrafts } from '../../../../../src/application/features/wallet/common/walletLedger.js';
import { assertMovementShape } from '../../../../../src/domain/wallet/walletMovement.js';
import { COLOMBIA_INVOICING } from '../../../../fixtures/walletFixtures.js';

const OWNER = { goalkeeperId: 'gk-1', currency: 'COP', invoicing: COLOMBIA_INVOICING };
const AT = new Date('2026-09-29T12:00:00.000Z');

describe('VAT drafts (feature 023)', () => {
  it('charges the commission\'s VAT with its own cause key and rate', () => {
    const draft = commissionVatDraft(OWNER, { bookingId: 'b-1', requestId: 'r-1', base: 7000, rateBps: 1900 }, 'm-2', AT);

    expect(draft).toMatchObject({
      type: 'commission_vat',
      amount: -1330,
      causeKey: 'commission_vat:b-1',
      references: { bookingId: 'b-1', requestId: 'r-1' },
      taxRateBps: 1900,
    });
    expect(() => assertMovementShape(draft!)).not.toThrow();
  });

  it('records nothing at 0 %', () => {
    expect(commissionVatDraft(OWNER, { bookingId: 'b-1', requestId: 'r-1', base: 7000, rateBps: 0 }, 'm-2', AT)).toBeNull();
  });

  it('drafts a money penalty with its VAT, and without it at 0 %', () => {
    const drafts = penaltyChargeDrafts(OWNER, { penaltyEventId: 'p-1', amount: 7000, rateBps: 1900, references: { bookingId: 'b-1' } }, ['m-1', 'm-2'], AT);

    expect(drafts.map((draft) => [draft.type, draft.amount, draft.causeKey])).toEqual([
      ['penalty', -7000, 'penalty:p-1'],
      ['penalty_vat', -1330, 'penalty_vat:p-1'],
    ]);
    drafts.forEach((draft) => expect(() => assertMovementShape(draft)).not.toThrow());
    expect(penaltyChargeDrafts(OWNER, { penaltyEventId: 'p-1', amount: 7000, rateBps: 0, references: {} }, ['m-1', 'm-2'], AT)).toHaveLength(1);
  });
});
