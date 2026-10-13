import type { IClock } from '../../../common/clock.js';
import type { IUserRepository } from '../../auth/common/ports.js';
import type { IGoalkeeperProfileRepository } from '../../goalkeepers/common/ports.js';
import type { IUserBlockRepository, UserBlockRecord } from './ports.js';
import type { UserBlockResult } from './views.js';

/** What blocking and unblocking read and write (admin spec 005, FR-026–FR-029). */
export interface BlockingDependencies {
  users: Pick<IUserRepository, 'getById'>;
  blocks: IUserBlockRepository;
  profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId' | 'setAvailableForOffers'>;
  clock: IClock;
}

export type BlockingResult =
  | { outcome: 'not_found' }
  | { outcome: 'validation_failed'; fieldErrors: Record<string, string> };

/** What a block or unblock answers, and what its audit entry keeps. */
export function blockResult(record: UserBlockRecord, reason: string, availableForOffers: boolean | null): UserBlockResult {
  return {
    userId: record.userId,
    blocked: record.blocked,
    blockedAt: record.blockedAt?.toISOString() ?? null,
    unblockedAt: record.unblockedAt?.toISOString() ?? null,
    reason,
    availableForOffers,
  };
}
