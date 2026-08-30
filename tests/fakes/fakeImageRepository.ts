import type { IImageRepository } from '../../src/application/features/images/common/ports.js';
import { StoredImage } from '../../src/domain/images/storedImage.js';

export class FakeImageRepository implements IImageRepository {
  private readonly images = new Map<string, StoredImage>();
  addError: Error | null = null;

  seed(image: StoredImage): void {
    this.images.set(image.id, image);
  }

  async getAll(): Promise<StoredImage[]> {
    return [...this.images.values()];
  }

  async getById(id: string): Promise<StoredImage | null> {
    return this.images.get(id) ?? null;
  }

  async add(entity: StoredImage): Promise<void> {
    if (this.addError) throw this.addError;
    this.images.set(entity.id, entity);
  }

  async update(entity: StoredImage): Promise<void> {
    this.images.set(entity.id, entity);
  }

  async delete(id: string): Promise<void> {
    this.images.delete(id);
  }
}
