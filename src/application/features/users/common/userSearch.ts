import type { Document } from 'mongodb';

/** Below this, a search does not filter (spec edge cases). */
const MIN_LENGTH = 2;
/** From this many digits, the search is a phone number. */
const MIN_PHONE_DIGITS = 7;
const NAME_FIELDS = ['firstName', 'lastName', 'displayName'] as const;

/** Each base letter and the accented forms it stands for, in both cases. */
const LETTER_CLASSES: Readonly<Record<string, string>> = {
  a: 'aáàäâAÁÀÄÂ',
  e: 'eéèëêEÉÈËÊ',
  i: 'iíìïîIÍÌÏÎ',
  o: 'oóòöôOÓÒÖÔ',
  u: 'uúùüûUÚÙÜÛ',
  n: 'nñNÑ',
};

/**
 * The `$match` for the administrators' user search (admin spec 005, research §4): an email when it
 * has `@`, a phone number (ending in those digits) when it has 7 digits or more, and otherwise a
 * name, where every word must appear in the first name, the last name or the Google name, without
 * caring about accents or case. `null` when the search is too short to filter.
 *
 * Mongo's regex is not accent-insensitive, so each vowel and the ñ become a character class; the
 * collection is scanned, which is fine at today's size (thousands of users).
 */
export function userSearchMatch(search: string): Document | null {
  const query = search.trim();
  if (query.length < MIN_LENGTH) return null;

  if (query.includes('@')) return { email: { $regex: escapeRegex(query), $options: 'i' } };

  const digits = query.replace(/[\s\-+()]/g, '');
  if (/^\d+$/.test(digits) && digits.length >= MIN_PHONE_DIGITS) {
    return { normalizedPhoneNumber: { $regex: `${digits}$` } };
  }

  const words = query.split(/\s+/).filter(Boolean);
  return {
    $and: words.map((word) => {
      const pattern = accentInsensitive(word);
      return { $or: NAME_FIELDS.map((field) => ({ [field]: { $regex: pattern, $options: 'i' } })) };
    }),
  };
}

function accentInsensitive(word: string): string {
  const base = word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return [...base].map((letter) => (LETTER_CLASSES[letter] ? `[${LETTER_CLASSES[letter]}]` : escapeRegex(letter))).join('');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
