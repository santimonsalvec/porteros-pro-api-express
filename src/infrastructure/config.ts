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
  // Domain events (feature 013). `local` delivers events in-process and sweeps on a timer;
  // `pubsub` publishes to Google Cloud Pub/Sub and relies on Cloud Scheduler for the sweep.
  events: {
    mode: optionalEnv('EVENTS_MODE', 'local') as EventsMode,
    gcpProjectId: (): string => requireEnv('GCP_PROJECT_ID'),
    topic: optionalEnv('EVENTS_TOPIC', 'booking-events'),
    relayTimeoutMs: 2000,
    pendingWarningMinutes: 5,
    sweepBatchLimit: 200,
  },
  // Who may call /internal/* (feature 013): Google OIDC tokens for this audience, issued to
  // one of these service accounts (the Pub/Sub push identity and the Cloud Scheduler identity).
  internalAuth: {
    /** Empty means no internal caller is accepted (local development). */
    audience: optionalEnv('INTERNAL_OIDC_AUDIENCE', ''),
    allowedInvokers: optionalEnv('INTERNAL_ALLOWED_INVOKERS', '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  },
  // Push notifications (feature 014). `log` only logs what would be sent; `fcm` sends through
  // Firebase Cloud Messaging with the service account's own credentials.
  push: {
    mode: optionalEnv('PUSH_MODE', 'log') as PushMode,
    firebaseProjectId: (): string => requireEnv('FIREBASE_PROJECT_ID'),
    inactivityDays: Number(optionalEnv('PUSH_DEVICE_INACTIVITY_DAYS', '60')),
    maxDevicesPerUser: Number(optionalEnv('PUSH_MAX_DEVICES_PER_USER', '10')),
    testLimitPerMinute: Number(optionalEnv('PUSH_TEST_LIMIT_PER_MINUTE', '5')),
  },
  // Offers to eligible goalkeepers (feature 015). Global while Colombia is the only country;
  // they move to per-country booking settings when a second country launches.
  offers: {
    reminderIntervalMinutes: Number(optionalEnv('OFFER_REMINDER_INTERVAL_MINUTES', '5')),
    maxReminders: Number(optionalEnv('OFFER_MAX_REMINDERS', '3')),
    /** At most this many open bookings are read by one reminder round. */
    roundCap: 2000,
  },
};

export type EventsMode = 'local' | 'pubsub';
export type PushMode = 'log' | 'fcm';

/**
 * Fails fast at startup when the events configuration cannot work: an unknown mode, or
 * `pubsub` mode without its project, audience or invokers.
 */
export function assertEventsConfig(): void {
  const { mode } = config.events;
  if (mode !== 'local' && mode !== 'pubsub') {
    throw new Error(`EVENTS_MODE must be "local" or "pubsub", got "${String(mode)}"`);
  }
  if (mode === 'pubsub') {
    config.events.gcpProjectId();
    if (!config.internalAuth.audience) {
      throw new Error('Missing required environment variable: INTERNAL_OIDC_AUDIENCE');
    }
    if (config.internalAuth.allowedInvokers.length === 0) {
      throw new Error('Missing required environment variable: INTERNAL_ALLOWED_INVOKERS');
    }
  }
}

/**
 * Fails fast at startup when the push configuration cannot work: an unknown mode, `fcm` mode
 * without its Firebase project, or a limit that is not a positive integer.
 */
export function assertPushConfig(): void {
  const { mode } = config.push;
  if (mode !== 'log' && mode !== 'fcm') {
    throw new Error(`PUSH_MODE must be "log" or "fcm", got "${String(mode)}"`);
  }
  if (mode === 'fcm') config.push.firebaseProjectId();
  const limits: Record<string, number> = {
    PUSH_DEVICE_INACTIVITY_DAYS: config.push.inactivityDays,
    PUSH_MAX_DEVICES_PER_USER: config.push.maxDevicesPerUser,
    PUSH_TEST_LIMIT_PER_MINUTE: config.push.testLimitPerMinute,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer, got "${String(value)}"`);
    }
  }
}

/** Fails fast at startup when a reminder setting is not a positive integer. */
export function assertOffersConfig(): void {
  const limits: Record<string, number> = {
    OFFER_REMINDER_INTERVAL_MINUTES: config.offers.reminderIntervalMinutes,
    OFFER_MAX_REMINDERS: config.offers.maxReminders,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer, got "${String(value)}"`);
    }
  }
}
