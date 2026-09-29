import type { IAuditLogger } from '../../application/features/auth/common/ports.js';
import type {
  IAcceptanceAuditLogger,
  IBookingAuditLogger,
} from '../../application/features/goalkeeperRequests/common/ports.js';
import { logger } from './logger.js';

type BookingConfirmationEntry = Parameters<IBookingAuditLogger['logBookingConfirmation']>[0];
type AcceptanceEntry = Parameters<IAcceptanceAuditLogger['logAcceptance']>[0];

export class PinoAuditLogger implements IAuditLogger, IBookingAuditLogger, IAcceptanceAuditLogger {
  logSsoAttempt(entry: { provider: string; platform: string; success: boolean; reason?: string }): void {
    logger.info({ audit: 'sso_attempt', ...entry }, 'SSO authentication attempt');
  }

  logClientCancellation(entry: { outcome: string; clientId: string; requestId: string; bookingId?: string }): void {
    const record = { audit: 'client_cancellation', ...entry };
    if (entry.outcome === 'cancelled' || entry.outcome === 'replayed') logger.info(record, 'Client cancellation');
    else logger.warn(record, 'Client cancellation refused');
  }

  logWithdrawal(entry: { outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }): void {
    const record = { audit: 'goalkeeper_withdrawal', ...entry };
    if (entry.outcome === 'withdrawn' || entry.outcome === 'replayed') logger.info(record, 'Goalkeeper withdrawal');
    else logger.warn(record, 'Goalkeeper withdrawal refused');
  }

  logPenaltyReversal(entry: { outcome: string; adminId: string; goalkeeperId: string; withdrawalId: string }): void {
    const record = { audit: 'penalty_reversal', ...entry };
    if (entry.outcome === 'reversed' || entry.outcome === 'replayed') logger.info(record, 'Withdrawal penalty reversal');
    else logger.warn(record, 'Withdrawal penalty reversal refused');
  }

  logCheckIn(entry: { outcome: string; goalkeeperId: string; bookingId: string; requestId?: string }): void {
    const record = { audit: 'goalkeeper_check_in', ...entry };
    if (entry.outcome === 'checked_in' || entry.outcome === 'replayed') logger.info(record, 'Goalkeeper check-in');
    else logger.warn(record, 'Goalkeeper check-in refused');
  }

  logBookingConfirmation(entry: BookingConfirmationEntry): void {
    const succeeded = entry.outcome === 'created' || entry.outcome === 'replayed';
    const record = { audit: 'booking_confirmation', ...entry };
    if (succeeded) logger.info(record, 'Booking confirmation');
    else logger.warn(record, 'Booking confirmation refused');
  }

  logAcceptance(entry: AcceptanceEntry): void {
    const record = { audit: 'booking_acceptance', ...entry };
    if (entry.outcome === 'accepted' || entry.outcome === 'replayed') logger.info(record, 'Booking acceptance');
    else logger.warn(record, 'Booking acceptance refused');
  }
}
