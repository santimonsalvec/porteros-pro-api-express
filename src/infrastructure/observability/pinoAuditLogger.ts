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
