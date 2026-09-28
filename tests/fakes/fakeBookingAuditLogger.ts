import type { IBookingAuditLogger } from '../../src/application/features/goalkeeperRequests/common/ports.js';

type Entry = Parameters<IBookingAuditLogger['logBookingConfirmation']>[0];

export class FakeBookingAuditLogger implements IBookingAuditLogger {
  readonly entries: Entry[] = [];

  readonly cancellations: Array<{ outcome: string; clientId: string; requestId: string; bookingId?: string }> = [];

  logBookingConfirmation(entry: Entry): void {
    this.entries.push(entry);
  }

  logClientCancellation(entry: { outcome: string; clientId: string; requestId: string; bookingId?: string }): void {
    this.cancellations.push(entry);
  }
}
