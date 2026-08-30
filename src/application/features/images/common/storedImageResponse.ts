import type { StoredImage } from '../../../../domain/images/storedImage.js';

export interface StoredImageResponse {
  id: string;
  url: string;
  format: string;
  bytes: number;
  width: number;
  height: number;
  createdAt: string;
}

/** Single place the StoredImage -> StoredImageResponse projection exists, reused by store and resolve. Never includes externalId or uploadedBy (FR-004). */
export function toStoredImageResponse(image: StoredImage): StoredImageResponse {
  return {
    id: image.id,
    url: image.url,
    format: image.format,
    bytes: image.bytes,
    width: image.width,
    height: image.height,
    createdAt: image.createdAt.toISOString(),
  };
}
