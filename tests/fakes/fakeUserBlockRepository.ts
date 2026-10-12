import type { BlockWriteResult, IUserBlockRepository, UserBlockRecord } from '../../src/application/features/users/common/ports.js';

export class FakeUserBlockRepository implements IUserBlockRepository {
  readonly records = new Map<string, UserBlockRecord>();

  async findByUserId(userId: string): Promise<UserBlockRecord | null> {
    return this.records.get(userId) ?? null;
  }

  async findByUserIds(userIds: readonly string[]): Promise<Map<string, UserBlockRecord>> {
    return new Map(userIds.flatMap((id) => (this.records.has(id) ? [[id, this.records.get(id)!] as const] : [])));
  }

  async block(userId: string, by: string, reason: string, at: Date): Promise<BlockWriteResult> {
    const current = this.records.get(userId);
    if (current?.blocked) return { outcome: 'unchanged', record: current };
    const record: UserBlockRecord = {
      ...(current ?? { unblockedAt: null, unblockedBy: null, unblockReason: null, revision: -1 }),
      userId, blocked: true, blockedAt: at, blockedBy: by, blockReason: reason,
      revision: (current?.revision ?? -1) + 1,
    };
    this.records.set(userId, record);
    return { outcome: 'changed', record };
  }

  async unblock(userId: string, by: string, reason: string, at: Date): Promise<BlockWriteResult> {
    const current = this.records.get(userId);
    if (!current?.blocked) {
      return { outcome: 'unchanged', record: current ?? emptyRecord(userId) };
    }
    const record = { ...current, blocked: false, unblockedAt: at, unblockedBy: by, unblockReason: reason, revision: current.revision + 1 };
    this.records.set(userId, record);
    return { outcome: 'changed', record };
  }
}

function emptyRecord(userId: string): UserBlockRecord {
  return { userId, blocked: false, blockedAt: null, blockedBy: null, blockReason: null, unblockedAt: null, unblockedBy: null, unblockReason: null, revision: 0 };
}
