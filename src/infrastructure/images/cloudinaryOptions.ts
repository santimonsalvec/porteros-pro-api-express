export interface CloudinaryOptions {
  /**
   * `cloudinary://<api_key>:<api_secret>@<cloud_name>`. Read lazily (called on first
   * use, not at construction) — a missing value only breaks image storage, not the
   * whole app's startup.
   */
  cloudinaryUrl: () => string;
}
