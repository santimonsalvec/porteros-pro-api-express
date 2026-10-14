import type { AdminSecurityEvent, IAdminSecurityLog } from '../../application/features/staff/common/ports.js';
import { logger } from './logger.js';

/**
 * Admin web sessions in the security log (spec 001, FR-016): ids and outcomes only, never an email or
 * a token. Sign-in codes (spec 009) add the method and the masked address, never the code.
 */
export class PinoAdminSecurityLog implements IAdminSecurityLog {
  log(event: AdminSecurityEvent): void {
    const record = { audit: event.event, ...event };
    if (event.outcome === 'signed_in' || event.outcome === 'refreshed' || event.outcome === 'signed_out' || event.outcome === 'sent') {
      logger.info(record, 'Admin web session');
    } else {
      logger.warn(record, 'Admin web session refused');
    }
  }
}
