import type { IOfferPushState } from '../../src/application/features/notifications/common/ports.js';

/** In-memory `offerPushState`: a claim succeeds only when the last push is at least the interval old. */
export class FakeOfferPushState implements IOfferPushState {
  private readonly lastPush = new Map<string, Date>();

  async tryClaim(goalkeeperId: string, now: Date, intervalMinutes: number): Promise<boolean> {
    const last = this.lastPush.get(goalkeeperId);
    if (last && now.getTime() - last.getTime() < intervalMinutes * 60_000) return false;
    this.lastPush.set(goalkeeperId, now);
    return true;
  }

  async markPushed(goalkeeperIds: readonly string[], now: Date): Promise<void> {
    for (const goalkeeperId of goalkeeperIds) this.lastPush.set(goalkeeperId, now);
  }

  lastPushOf(goalkeeperId: string): Date | undefined {
    return this.lastPush.get(goalkeeperId);
  }
}
