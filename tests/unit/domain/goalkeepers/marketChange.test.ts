import { describe, expect, it } from 'vitest';
import { marketChangeRefusal, type MarketChangeFacts } from '../../../../src/domain/goalkeepers/marketChange.js';

const SAME_COUNTRY = { currentMarketId: 'med', currentCountryId: 'co', target: { id: 'bog', countryId: 'co', status: 'enabled' as const } };
const OTHER_COUNTRY = { ...SAME_COUNTRY, target: { id: 'gye', countryId: 'ec', status: 'enabled' as const } };
const CLEAN: MarketChangeFacts = { assignedBookingIds: [], balance: 0, currency: 'COP', pendingDepositId: null, closureOpen: false };

describe('marketChangeRefusal (spec 031, data-model §7)', () => {
  it('lets a goalkeeper with nothing pending change market', () => {
    expect(marketChangeRefusal(SAME_COUNTRY, CLEAN)).toBeNull();
    expect(marketChangeRefusal(OTHER_COUNTRY, CLEAN)).toBeNull();
  });

  it('refuses a market that does not exist or is not enabled, and the current one', () => {
    expect(marketChangeRefusal({ ...SAME_COUNTRY, target: null }, CLEAN)).toEqual({ kind: 'market_not_available' });
    expect(marketChangeRefusal({ ...SAME_COUNTRY, target: { ...SAME_COUNTRY.target, status: 'disabled' } }, CLEAN)).toEqual({ kind: 'market_not_available' });
    expect(marketChangeRefusal({ ...SAME_COUNTRY, target: { id: 'med', countryId: 'co', status: 'enabled' } }, CLEAN)).toEqual({ kind: 'same_market' });
  });

  it('refuses while the goalkeeper holds bookings not played yet, naming them', () => {
    expect(marketChangeRefusal(SAME_COUNTRY, { ...CLEAN, assignedBookingIds: ['b-1', 'b-2'] })).toEqual({ kind: 'pending_bookings', bookingIds: ['b-1', 'b-2'] });
  });

  it('within the country, a balance, a pending deposit or an open closure are no obstacle', () => {
    expect(marketChangeRefusal(SAME_COUNTRY, { ...CLEAN, balance: 20000, pendingDepositId: 'd-1', closureOpen: true })).toBeNull();
  });

  it('to another country, needs a zero balance, no pending deposit and no open closure, in that order', () => {
    expect(marketChangeRefusal(OTHER_COUNTRY, { ...CLEAN, balance: 20000, pendingDepositId: 'd-1' })).toEqual({ kind: 'balance_not_zero', balance: 20000, currency: 'COP' });
    expect(marketChangeRefusal(OTHER_COUNTRY, { ...CLEAN, balance: -500 })).toEqual({ kind: 'balance_not_zero', balance: -500, currency: 'COP' });
    expect(marketChangeRefusal(OTHER_COUNTRY, { ...CLEAN, pendingDepositId: 'd-1', closureOpen: true })).toEqual({ kind: 'deposit_pending', depositId: 'd-1' });
    expect(marketChangeRefusal(OTHER_COUNTRY, { ...CLEAN, closureOpen: true })).toEqual({ kind: 'account_closure_open' });
  });

  it('treats a goalkeeper without an operating balance as having nothing to move', () => {
    expect(marketChangeRefusal(OTHER_COUNTRY, { ...CLEAN, balance: null, currency: null })).toBeNull();
  });
});
