import type { ClosureBlocker, IClosureBlockersReader } from '../../src/application/features/accountClosures/common/ports.js';

export class FakeClosureBlockersReader implements IClosureBlockersReader {
  readonly byUser = new Map<string, ClosureBlocker[]>();

  async forUser(userId: string): Promise<ClosureBlocker[]> {
    return this.byUser.get(userId) ?? [];
  }
}
