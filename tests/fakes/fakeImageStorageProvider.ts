import type { IImageStorageProvider, ProviderUploadResult } from '../../src/application/features/images/common/ports.js';

export class FakeImageStorageProvider implements IImageStorageProvider {
  uploadResult: ProviderUploadResult = {
    externalId: 'fake-external-id',
    url: 'https://res.cloudinary.com/fake/image/upload/fake.jpg',
    format: 'jpg',
    bytes: 1024,
    width: 800,
    height: 600,
  };
  uploadError: Error | null = null;
  deleteError: Error | null = null;
  deletedExternalIds: string[] = [];
  uploadCallCount = 0;

  async upload(_buffer: Buffer, _contentType: string): Promise<ProviderUploadResult> {
    this.uploadCallCount += 1;
    if (this.uploadError) throw this.uploadError;
    return this.uploadResult;
  }

  async delete(externalId: string): Promise<void> {
    if (this.deleteError) throw this.deleteError;
    this.deletedExternalIds.push(externalId);
  }
}
