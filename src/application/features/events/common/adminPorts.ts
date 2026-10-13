/** A pending event as the admin sees it (admin spec 008, research §7): never its payload. */
export interface PendingEventRecord {
  id: string;
  type: string;
  bookingId: string;
  requestId: string;
  createdAt: Date;
  attempts: number;
  claimedUntil: Date;
}

/** The outbox read by the admin's Sistema; the sweep and the relay never use it. */
export interface IOutboxAdminReader {
  /** Pending events, oldest first; `retried`: only those the sweep tried more than once. */
  listPending(filter: { retried: boolean }, page: number, pageSize: number): Promise<{ items: PendingEventRecord[]; totalItems: number }>;
  retriedCount(): Promise<number>;
}

/** A scheduled job's lease (research §8): when a sweep last took it and until when. */
export interface JobLease {
  lockedAt: Date;
  lockedUntil: Date;
}

/** The job leases read by the admin's Sistema, without taking any. */
export interface IJobLockReader {
  /** Only the jobs that ever ran have one. */
  list(names: readonly string[]): Promise<Map<string, JobLease>>;
}
