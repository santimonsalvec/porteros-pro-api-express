import type { IRefreshTokenRepository } from '../../src/application/features/auth/common/ports.js';
import { RefreshToken } from '../../src/domain/users/refreshToken.js';

export class FakeRefreshTokenRepository implements IRefreshTokenRepository {
  private readonly tokens = new Map<string, RefreshToken>();

  async getAll(): Promise<RefreshToken[]> {
    return [...this.tokens.values()];
  }

  async getById(id: string): Promise<RefreshToken | null> {
    return this.tokens.get(id) ?? null;
  }

  async add(entity: RefreshToken): Promise<void> {
    this.tokens.set(entity.id, entity);
  }

  async update(entity: RefreshToken): Promise<void> {
    this.tokens.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.tokens.delete(id);
  }

  async findActiveByHash(tokenHash: string): Promise<RefreshToken | null> {
    for (const token of this.tokens.values()) {
      if (token.tokenHash === tokenHash && token.isActive()) return token;
    }
    return null;
  }

  async markUsed(id: string): Promise<void> {
    const token = this.tokens.get(id);
    if (token) token.markUsed();
  }
}
