import dotenv from 'dotenv';

// Development convenience only — production reads exclusively from real environment
// variables, never a committed file (FR-004).
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value === undefined || value.trim() === '' ? defaultValue : value;
}

export const config = {
  port: Number(optionalEnv('PORT', '3000')),
  // Read lazily (called at first use, not at module load) so a missing value only
  // breaks the specific capability that needs it, mirroring the source system's
  // lazily-resolved JWT signing key and connection-string-validated-on-construction design.
  mongoConnectionString: (): string => requireEnv('MONGODB_CONNECTION_STRING'),
  jwt: {
    signingKey: (): string => requireEnv('JWT_SIGNING_KEY'),
    accessTokenLifetimeMinutes: Number(optionalEnv('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', '15')),
    refreshTokenLifetimeDays: Number(optionalEnv('JWT_REFRESH_TOKEN_LIFETIME_DAYS', '30')),
  },
  google: {
    clientIdMobile: process.env.GOOGLE_CLIENT_ID_MOBILE,
    clientIdWeb: process.env.GOOGLE_CLIENT_ID_WEB,
  },
  legal: {
    termsVersion: optionalEnv('LEGAL_TERMS_VERSION', '1.0'),
    privacyPolicyVersion: optionalEnv('LEGAL_PRIVACY_POLICY_VERSION', '1.0'),
  },
  otel: {
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  images: {
    maxUploadSizeBytes: Number(optionalEnv('IMAGE_MAX_UPLOAD_SIZE_BYTES', String(10 * 1024 * 1024))),
    // `cloudinary://<api_key>:<api_secret>@<cloud_name>` — the Cloudinary SDK parses this
    // itself (see cloudinaryImageStorageProvider.ts); this getter only fail-fasts with a
    // clear error when it's missing, consistent with every other lazily-read secret above.
    cloudinaryUrl: (): string => requireEnv('CLOUDINARY_URL'),
  },
};
