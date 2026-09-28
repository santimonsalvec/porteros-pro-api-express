import type { IJobLockStore } from '../../src/application/features/events/common/ports.js';

/** Leases as in `jobLocks`: a job is held until its lease expires or it is released. */
export class FakeJobLockStore implements IJobLockStore {
  private readonly lockedUntil = new Map<string, Date>();

  async tryAcquire(name: string, now: Date, leaseSeconds: number): Promise<boolean> {
    const until = this.lockedUntil.get(name);
    if (until && until > now) return false;
    this.lockedUntil.set(name, new Date(now.getTime() + leaseSeconds * 1000));
    return true;
  }

  async release(name: string, now: Date): Promise<void> {
    this.lockedUntil.set(name, now);
  }
}
