import type { PushMessage } from '../devices/deviceRules.js';
import type { Language } from '../i18n/language.js';
import { catalog } from '../i18n/messages/catalog.js';

/** Inbox and push types of a goalkeeper's validation and verification (admin spec 030). */
export const VETTING_VALIDATED_TYPE = 'vetting.validated';
export const VETTING_VALIDATION_REJECTED_TYPE = 'vetting.validation_rejected';
export const VETTING_VERIFIED_TYPE = 'vetting.verified';

export function validatedMessage(language: Language): PushMessage {
  return { ...catalog(language).validated(), data: { type: VETTING_VALIDATED_TYPE } };
}

/** The reason is at most 300 characters, so the body stays within the push limit. */
export function validationRejectedMessage(language: Language, reason: string): PushMessage {
  return { ...catalog(language).validationRejected(reason), data: { type: VETTING_VALIDATION_REJECTED_TYPE } };
}

export function verifiedMessage(language: Language): PushMessage {
  return { ...catalog(language).verified(), data: { type: VETTING_VERIFIED_TYPE } };
}
