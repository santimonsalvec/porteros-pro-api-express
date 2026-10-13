import { IQuery } from '../../../../common/mediator/types.js';

export type HealthStatus = 'Healthy' | 'Degraded' | 'Unhealthy';

/** The public `/health` report, never with error details (FR-038 of the API). */
export interface HealthReport {
  status: HealthStatus;
  checks: { name: string; status: HealthStatus }[];
}

/** The platform's health for Sistema (contracts/dashboard-system-api.md §2). */
export class GetSystemHealthQuery extends IQuery<HealthReport & { checkedAt: Date }> {}
