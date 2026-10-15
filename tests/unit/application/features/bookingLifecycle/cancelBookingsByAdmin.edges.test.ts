import { describe, expect, it, vi } from 'vitest';
import { CancelBookingsByAdminCommand } from '../../../../../src/application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommand.js';
import { CancelBookingsByAdminCommandHandler } from '../../../../../src/application/features/bookingLifecycle/commands/cancelBookingsByAdmin/cancelBookingsByAdminCommandHandler.js';
import type { AdminCancelResult, IBookingLifecycleStore } from '../../../../../src/application/features/bookingLifecycle/common/ports.js';
import { FakeBookingAuditLogger } from '../../../../fakes/fakeBookingAuditLogger.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { lifecycleHarness } from './lifecycleHarness.js';

/** The store's rarer answers, through a stub (admin spec 006, research §1). */
function handlerWith(answers: AdminCancelResult[]) {
  const h = lifecycleHarness();
  const store = { cancelByAdmin: vi.fn(async () => answers.shift()!) } as unknown as IBookingLifecycleStore;
  const warnings: Record<string, unknown>[] = [];
  const handler = new CancelBookingsByAdminCommandHandler({
    bookingRepository: h.bookingRepository,
    store,
    operatingBalanceContext: h.operatingBalanceContext,
    relay: h.relay,
    idGenerator: h.idGenerator,
    clock: h.clock,
    audit: new FakeBookingAuditLogger(),
    logger: { info: () => undefined, warn: (entry) => void warnings.push(entry) },
  });
  return { h, store, handler, warnings };
}

const cancel = (handler: CancelBookingsByAdminCommandHandler) => handler.handle(new CancelBookingsByAdminCommand('staff-user-1', 'r1', null, 'La cancha cerró'));

describe('CancelBookingsByAdminCommand, rarer outcomes', () => {
  it('resolves a goalkeeper assigned meanwhile and tries once more', async () => {
    const { h, store, handler } = handlerWith([{ kind: 'owner_required', goalkeeperId: 'gk-late' }, { kind: 'replayed' }]);
    h.goalkeeperProfileRepository.seed(buildGoalkeeperProfile('gk-late'));

    expect(await cancel(handler)).toEqual({ outcome: 'replayed' });
    expect(store.cancelByAdmin).toHaveBeenCalledTimes(2);
  });

  it("answers temporarily unavailable when the late goalkeeper's operatingBalance can't be resolved, or the store asks again", async () => {
    expect(await cancel(handlerWith([{ kind: 'owner_required', goalkeeperId: 'gk-unknown' }]).handler)).toEqual({ outcome: 'temporarily_unavailable' });
  });

  it('answers temporarily unavailable, logging only ids, when a held booking has no charge', async () => {
    const { handler, warnings } = handlerWith([{ kind: 'missing_charge', bookingId: 'b-1' }]);

    expect(await cancel(handler)).toEqual({ outcome: 'temporarily_unavailable' });
    expect(warnings).toEqual([{ outcome: 'admin_cancel_missing_charge', requestId: 'r1', bookingId: 'b-1' }]);
  });
});
