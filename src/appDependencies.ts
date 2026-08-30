import type { ISender } from './application/common/mediator/types.js';
import type { AccessTokenClaims } from './application/features/auth/common/accessTokenClaims.js';
import type { HealthReportResponse } from './infrastructure/healthChecks/healthReport.js';

/**
 * Everything `app.ts` needs to assemble routers, injected from the composition root
 * (`server.ts` for production, each HTTP test file for its own fake-backed wiring) —
 * the Express layer never imports MongoDB, Google, or JWT libraries directly.
 */
export interface AppDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
  checkHealth: () => Promise<HealthReportResponse>;
}
