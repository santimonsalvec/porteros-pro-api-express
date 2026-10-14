import type { SystemParameterValues } from '../application/features/system/queries/getSystemParameters/getSystemParametersQuery.js';
import { PARAMETER_DEFAULTS } from './config.js';

/** The server's secrets the admin may know are there (admin spec 008, research §10); never their value. */
const SECRET_NAMES = ['MONGODB_CONNECTION_STRING', 'JWT_SIGNING_KEY', 'CLOUDINARY_URL', 'RESEND_API_KEY'] as const;

const isSet = (value: string | undefined) => value !== undefined && value.trim() !== '';

/**
 * The read-only parameters and the secrets' presence, from the environment, with the same
 * defaults and parsing as `config`. Nothing else of a secret is read into the answer.
 */
export function readSystemParameters(env: NodeJS.ProcessEnv): SystemParameterValues {
  const raw = (name: keyof typeof PARAMETER_DEFAULTS) => (isSet(env[name]) ? env[name]! : PARAMETER_DEFAULTS[name]);
  const entry = <T>(name: keyof typeof PARAMETER_DEFAULTS, parse: (text: string) => T) => ({ name, value: parse(raw(name)), isDefault: !isSet(env[name]) });
  return {
    values: [
      entry('OFFER_REMINDER_INTERVAL_MINUTES', Number),
      entry('OFFER_MAX_REMINDERS', Number),
      entry('LEGAL_TERMS_VERSION', String),
      entry('LEGAL_PRIVACY_POLICY_VERSION', String),
      entry('INVOICING_ENABLED', (text) => text === 'true'),
      // How sign-in codes go out (admin spec 009): `resend`, or `log` outside production.
      entry('EMAIL_MODE', String),
    ],
    secrets: SECRET_NAMES.map((name) => ({ name, present: isSet(env[name]) })),
  };
}
