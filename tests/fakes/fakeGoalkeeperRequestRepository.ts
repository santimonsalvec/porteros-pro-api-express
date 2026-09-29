import type { IGoalkeeperRequestRepository } from '../../src/application/features/goalkeeperRequests/common/ports.js';
import { contactsVisibleAt } from '../../src/domain/bookings/contactVisibility.js';
import { GoalkeeperRequest } from '../../src/domain/bookings/goalkeeperRequest.js';

export class FakeGoalkeeperRequestRepository implements IGoalkeeperRequestRepository {
  private readonly requests = new Map<string, GoalkeeperRequest>();

  seed(request: GoalkeeperRequest): void {
    this.requests.set(request.id, request);
  }

  all(): GoalkeeperRequest[] {
    return [...this.requests.values()];
  }

  async findDueForCancelAll(now: Date, cap: number): Promise<GoalkeeperRequest[]> {
    return this.all()
      .filter(
        (request) =>
          request.partialFulfillment === 'cancel_all' &&
          request.active &&
          request.cancelAllEvaluatedAt === null &&
          now.getTime() >= request.cancelAllUntil().getTime(),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async findDueForContactsReveal(now: Date, cap: number): Promise<GoalkeeperRequest[]> {
    return this.all()
      .filter(
        (request) =>
          request.active &&
          request.contactsRevealedAt === null &&
          request.startsAt.getTime() > now.getTime() &&
          contactsVisibleAt(request, now),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id))
      .slice(0, cap);
  }

  async markContactsRevealed(requestId: string, now: Date): Promise<boolean> {
    const request = this.requests.get(requestId);
    if (!request || request.contactsRevealedAt !== null) return false;
    this.requests.set(requestId, GoalkeeperRequest.rehydrate({ ...request, contactsRevealedAt: now }));
    return true;
  }

  async findByQuoteForClient(quoteId: string, clientId: string): Promise<GoalkeeperRequest | null> {
    return this.all().find((request) => request.quoteId === quoteId && request.clientId === clientId) ?? null;
  }

  async findByIds(ids: string[]): Promise<GoalkeeperRequest[]> {
    return ids.flatMap((id) => this.requests.get(id) ?? []);
  }

  async findActiveByMatchForClient(clientId: string, zoneId: string, startsAt: Date): Promise<GoalkeeperRequest | null> {
    return (
      this.all().find(
        (request) =>
          request.active &&
          request.clientId === clientId &&
          request.zoneId === zoneId &&
          request.startsAt.getTime() === startsAt.getTime(),
      ) ?? null
    );
  }

  async countForClient(clientId: string, now: Date): Promise<{ upcoming: number; past: number }> {
    const own = this.all().filter((request) => request.clientId === clientId);
    const upcoming = own.filter((request) => request.startsAt >= now).length;
    return { upcoming, past: own.length - upcoming };
  }

  async findUpcomingForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]> {
    return this.all()
      .filter((request) => request.clientId === clientId && request.startsAt >= now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || compareIds(a.id, b.id))
      .slice(skip, skip + limit);
  }

  async findPastForClient(clientId: string, now: Date, skip: number, limit: number): Promise<GoalkeeperRequest[]> {
    return this.all()
      .filter((request) => request.clientId === clientId && request.startsAt < now)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || compareIds(b.id, a.id))
      .slice(skip, skip + limit);
  }
}

/** Binary string order, as MongoDB compares string `_id`s. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
