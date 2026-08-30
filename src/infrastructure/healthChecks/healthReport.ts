export type HealthStatus = 'Healthy' | 'Degraded' | 'Unhealthy';

export interface HealthCheckEntry {
  name: string;
  status: HealthStatus;
}

/** No exception/description/detail field — never leak internal error information (FR-038). */
export interface HealthReportResponse {
  status: HealthStatus;
  checks: HealthCheckEntry[];
}
