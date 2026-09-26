import type { IAuditLogger } from '../../application/features/auth/common/ports.js';
import type { IBookingAuditLogger } from '../../application/features/goalkeeperRequests/common/ports.js';
import { logger } from './logger.js';

type BookingConfirmationEntry = Parameters<IBookingAuditLogger['logBookingConfirmation']>[0];

export class PinoAuditLogger implements IAuditLogger, IBookingAuditLogger {
  logSsoAttempt(entry: { provider: string; platform: string; success: boolean; reason?: string }): void {
    logger.info({ audit: 'sso_attempt', ...entry }, 'SSO authentication attempt');
  }

  logBookingConfirmation(entry: BookingConfirmationEntry): void {
    const succeeded = entry.outcome === 'created' || entry.outcome === 'replayed';
    const record = { audit: 'booking_confirmation', ...entry };
    if (succeeded) logger.info(record, 'Booking confirmation');
    else logger.warn(record, 'Booking confirmation refused');
  }
}
