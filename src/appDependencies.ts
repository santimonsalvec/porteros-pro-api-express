import type { IPublisher, ISender } from './application/common/mediator/types.js';
import type { AccessTokenClaims } from './application/features/auth/common/accessTokenClaims.js';
import type { HealthReportResponse } from './infrastructure/healthChecks/healthReport.js';
import type { PaymentReturnSettings } from './controllers/paymentReturnController.js';

/**
 * Everything `app.ts` needs to assemble routers, injected from the composition root
 * (`server.ts` for production, each HTTP test file for its own fake-backed wiring) —
 * the Express layer never imports MongoDB, Google, or JWT libraries directly.
 */
export interface AppDependencies {
  mediator: ISender;
  verifyAccessToken: (token: string) => Promise<AccessTokenClaims | null>;
  checkHealth: () => Promise<HealthReportResponse>;
  /** Fans an event out to its consumers (feature 013, `/internal/events`). */
  publisher: IPublisher;
  /** True only for a platform OIDC token allowed to call `/internal/*` (feature 013). */
  verifyInternalCaller: (token: string) => Promise<boolean>;
  /** The payment return page's button and the app link association (feature 022). */
  paymentReturn: PaymentReturnSettings;
}
