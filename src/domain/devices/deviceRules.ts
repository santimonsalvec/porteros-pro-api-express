/** The platforms the mobile app ships on (spec Assumptions: no web push). */
export const DEVICE_PLATFORMS = ['ios', 'android'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

/** Push tokens are ~160–300 chars today; the spec bounds them generously (FR-004). */
export const MAX_TOKEN_LENGTH = 4096;

export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 500;
export const MAX_DATA_KEYS = 20;
/** FCM allows 4 KB; this leaves room for the platform blocks the adapter adds (research §9). */
export const MAX_MESSAGE_BYTES = 3072;

/** The trimmed token, or null when it is empty or too long. */
export function normalizeToken(raw: string): string | null {
  const token = raw.trim();
  return token.length === 0 || token.length > MAX_TOKEN_LENGTH ? null : token;
}

/**
 * What later features send (015, 019). `data` is what the app routes by: `type` names what
 * happened, and the ids the screen needs travel as separate keys (research §12).
 */
export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
  /**
   * Data only: nothing shows on the phone, the open app just reacts to `data` (e.g. reloads a
   * list). `title` and `body` are then empty.
   */
  silent?: boolean;
}

export type PushMessageValidation = { ok: true } | { ok: false; reason: string };

export function validatePushMessage(message: PushMessage): PushMessageValidation {
  const shown = !message.silent;
  if ((shown && message.title.length === 0) || message.title.length > MAX_TITLE_LENGTH) {
    return { ok: false, reason: 'title_length' };
  }
  if ((shown && message.body.length === 0) || message.body.length > MAX_BODY_LENGTH) {
    return { ok: false, reason: 'body_length' };
  }
  const entries = Object.entries(message.data);
  if (entries.length > MAX_DATA_KEYS) return { ok: false, reason: 'too_many_data_keys' };
  if (entries.some(([, value]) => typeof value !== 'string')) return { ok: false, reason: 'non_string_data' };
  if (!message.data.type) return { ok: false, reason: 'missing_type' };
  if (new TextEncoder().encode(JSON.stringify(message)).length > MAX_MESSAGE_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  return { ok: true };
}
