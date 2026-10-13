import type { IJobLockReader, JobLease } from '../../src/application/features/events/common/adminPorts.js';
import type { IJobLockStore } from '../../src/application/features/events/common/ports.js';

/** Leases as in `jobLocks`: a job is held until its lease expires or it is released. */
export class FakeJobLockStore implements IJobLockStore, IJobLockReader {
  private readonly leases = new Map<string, JobLease>();

  async tryAcquire(name: string, now: Date, leaseSeconds: number): Promise<boolean> {
    const until = this.leases.get(name)?.lockedUntil;
    if (until && until > now) return false;
    this.leases.set(name, { lockedAt: now, lockedUntil: new Date(now.getTime() + leaseSeconds * 1000) });
    return true;
  }

  async release(name: string, now: Date): Promise<void> {
    const lease = this.leases.get(name);
    this.leases.set(name, { lockedAt: lease?.lockedAt ?? now, lockedUntil: now });
  }

  async list(names: readonly string[]): Promise<Map<string, JobLease>> {
    return new Map(names.flatMap((name) => (this.leases.has(name) ? [[name, { ...this.leases.get(name)! }] as const] : [])));
  }
}
