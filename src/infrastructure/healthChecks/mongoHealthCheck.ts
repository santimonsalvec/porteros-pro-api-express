import type { Db } from 'mongodb';
import type { HealthReportResponse } from './healthReport.js';

const PING_TIMEOUT_MS = 3_000;

/**
 * Pings MongoDB's admin database with a short timeout. Never surfaces exception
 * detail (connection strings, stack traces, driver messages) — only Healthy/Unhealthy
 * (FR-038).
 */
export class MongoHealthCheck {
  constructor(private readonly db: Db) {}

  async check(): Promise<HealthReportResponse> {
    try {
      await Promise.race([
        this.db.command({ ping: 1 }),
        new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('MongoDB ping timed out')), PING_TIMEOUT_MS),
        ),
      ]);
      return { status: 'Healthy', checks: [{ name: 'mongodb', status: 'Healthy' }] };
    } catch {
      return { status: 'Unhealthy', checks: [{ name: 'mongodb', status: 'Unhealthy' }] };
    }
  }
}
