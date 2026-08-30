import { Router } from 'express';
import type { HealthReportResponse } from './responses/health/healthReportResponse.js';

export interface HealthControllerDependencies {
  checkHealth: () => Promise<HealthReportResponse>;
}

export function createHealthController(deps: HealthControllerDependencies): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const report = await deps.checkHealth();
    res.status(report.status === 'Unhealthy' ? 503 : 200).json(report);
  });

  return router;
}
