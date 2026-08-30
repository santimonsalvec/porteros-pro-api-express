import { Entity } from '../common/entity.js';

/**
 * A generic, provider-independent record of one image this system has stored on a
 * user's behalf. Deliberately excludes any field of the storage provider's own
 * response that doesn't serve referencing, displaying, or managing the image later.
 * Immutable once created — there is no "edit" operation (out of scope by design).
 */
export class StoredImage extends Entity<string> {
  readonly externalId: string;
  readonly url: string;
  readonly format: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly uploadedBy: string;
  readonly createdAt: Date;

  constructor(params: {
    id: string;
    externalId: string;
    url: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
    uploadedBy: string;
    createdAt: Date;
  }) {
    super(params.id);
    this.externalId = params.externalId;
    this.url = params.url;
    this.format = params.format;
    this.bytes = params.bytes;
    this.width = params.width;
    this.height = params.height;
    this.uploadedBy = params.uploadedBy;
    this.createdAt = params.createdAt;
  }

  static create(params: {
    id: string;
    externalId: string;
    url: string;
    format: string;
    bytes: number;
    width: number;
    height: number;
    uploadedBy: string;
  }): StoredImage {
    return new StoredImage({ ...params, createdAt: new Date() });
  }
}
