import type { ILoginCodeStore, LoginCodeWriteResult } from '../../src/application/features/auth/common/ports.js';
import { loginCodeId, MAX_FAILED_ATTEMPTS, purgeAfter, type LoginCodeAudience, type LoginCodeState } from '../../src/domain/auth/loginCode.js';

/** Same semantics as `MongoLoginCodeStore`: writes at a revision, one winner per code. */
export class FakeLoginCodeStore implements ILoginCodeStore {
  readonly states = new Map<string, LoginCodeState>();
  /** Makes the next insert or replace lose a race. */
  conflictNext = false;

  seed(state: LoginCodeState): void {
    this.states.set(state.id, structuredClone(state));
  }

  peek(audience: LoginCodeAudience, email: string): LoginCodeState | undefined {
    return this.states.get(loginCodeId(audience, email));
  }

  async get(audience: LoginCodeAudience, email: string): Promise<LoginCodeState | null> {
    const state = this.peek(audience, email);
    return state ? structuredClone(state) : null;
  }

  async insert(state: LoginCodeState): Promise<LoginCodeWriteResult> {
    if (this.takeConflict() || this.states.has(state.id)) return 'conflict';
    this.seed(state);
    return 'saved';
  }

  async replaceAtRevision(next: LoginCodeState, expectedRevision: number): Promise<LoginCodeWriteResult> {
    if (this.takeConflict() || this.states.get(next.id)?.revision !== expectedRevision) return 'conflict';
    this.seed(next);
    return 'saved';
  }

  async consume(audience: LoginCodeAudience, email: string, codeHash: string, now: Date): Promise<boolean> {
    const state = this.peek(audience, email);
    if (!state || state.status !== 'active' || state.codeHash !== codeHash || state.expiresAt <= now || state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return false;
    }
    state.status = 'used';
    state.purgeAt = purgeAfter(now);
    return true;
  }

  async recordFailure(audience: LoginCodeAudience, email: string, now: Date): Promise<void> {
    const state = this.peek(audience, email);
    if (!state || state.status !== 'active' || state.expiresAt <= now) return;
    state.failedAttempts += 1;
    if (state.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      state.status = 'invalidated';
      state.purgeAt = purgeAfter(now);
    }
  }

  private takeConflict(): boolean {
    const conflict = this.conflictNext;
    this.conflictNext = false;
    return conflict;
  }
}
