import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import type { IImageStorageProvider, ProviderUploadResult } from '../../application/features/images/common/ports.js';
import type { CloudinaryOptions } from './cloudinaryOptions.js';

/**
 * Storage-only Cloudinary adapter (research.md §1, §4). Every upload carries
 * `quality: 'auto', fetch_format: 'auto'` as an incoming transformation, so the asset
 * Cloudinary actually stores — not just a delivery-time view of it — is the optimized
 * one (FR-002). No transformation/editing feature is used beyond that (FR-011).
 */
export class CloudinaryImageStorageProvider implements IImageStorageProvider {
  constructor(private readonly options: CloudinaryOptions) {}

  /**
   * `cloudinary.config()` reads `CLOUDINARY_URL` from `process.env` itself the first
   * time it's called — we only need to fail fast with a clear error if it's missing
   * (`options.cloudinaryUrl()`) and ensure `secure: true` is set.
   */
  private configure(): void {
    this.options.cloudinaryUrl();
    cloudinary.config({ secure: true });
  }

  async upload(buffer: Buffer, _contentType: string): Promise<ProviderUploadResult> {
    this.configure();
    const response = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { resource_type: 'image', quality: 'auto', fetch_format: 'auto' },
        (error, result) => {
          if (error || !result) {
            reject(error ?? new Error('Cloudinary upload returned no result'));
            return;
          }
          resolve(result);
        },
      );
      uploadStream.end(buffer);
    });

    return {
      externalId: response.public_id,
      url: response.secure_url,
      format: response.format,
      bytes: response.bytes,
      width: response.width,
      height: response.height,
    };
  }

  async delete(externalId: string): Promise<void> {
    this.configure();
    await cloudinary.uploader.destroy(externalId, { resource_type: 'image' });
  }
}
