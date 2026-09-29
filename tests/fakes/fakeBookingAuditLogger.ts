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

  readonly withdrawals: Array<{ outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }> = [];
  readonly reversals: Array<{ outcome: string; adminId: string; goalkeeperId: string; withdrawalId: string }> = [];

  logWithdrawal(entry: { outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }): void {
    this.withdrawals.push(entry);
  }

  logPenaltyReversal(entry: { outcome: string; adminId: string; goalkeeperId: string; withdrawalId: string }): void {
    this.reversals.push(entry);
  }

  readonly checkIns: Array<{ outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }> = [];

  logCheckIn(entry: { outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }): void {
    this.checkIns.push(entry);
  }

  readonly ratings: Array<{ outcome: string; userId: string; bookingId: string; side?: string }> = [];
  readonly caseResolutions: Array<{ outcome: string; adminId: string; caseId: string }> = [];

  logRating(entry: { outcome: string; userId: string; bookingId: string; side?: string }): void {
    this.ratings.push(entry);
  }

  logCaseResolution(entry: { outcome: string; adminId: string; caseId: string }): void {
    this.caseResolutions.push(entry);
  }
}
