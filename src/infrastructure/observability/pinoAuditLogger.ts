import type { IAuditLogger } from '../../application/features/auth/common/ports.js';
import { logger } from './logger.js';

export class PinoAuditLogger implements IAuditLogger {
  logSsoAttempt(entry: { provider: string; platform: string; success: boolean; reason?: string }): void {
    logger.info({ audit: 'sso_attempt', ...entry }, 'SSO authentication attempt');
  }
}
