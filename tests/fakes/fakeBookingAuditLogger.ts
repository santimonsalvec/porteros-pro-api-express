import type { IBookingAuditLogger } from '../../src/application/features/goalkeeperRequests/common/ports.js';

type Entry = Parameters<IBookingAuditLogger['logBookingConfirmation']>[0];

export class FakeBookingAuditLogger implements IBookingAuditLogger {
  readonly entries: Entry[] = [];

  logBookingConfirmation(entry: Entry): void {
    this.entries.push(entry);
  }
}
