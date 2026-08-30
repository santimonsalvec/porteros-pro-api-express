import type { IRepository } from '../../../common/persistence/repository.js';
import type { StoredImage } from '../../../../domain/images/storedImage.js';

/**
 * The provider's upload response, translated to a shape the application layer can
 * depend on — not the provider's raw response (FR-004, FR-011).
 */
export interface ProviderUploadResult {
  externalId: string;
  url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Storage-only capability of the image storage provider — no transformation, editing,
 * or any other provider feature is exposed here by design (FR-011).
 */
export interface IImageStorageProvider {
  upload(buffer: Buffer, contentType: string): Promise<ProviderUploadResult>;
  delete(externalId: string): Promise<void>;
}

export type IImageRepository = IRepository<StoredImage, string>;
