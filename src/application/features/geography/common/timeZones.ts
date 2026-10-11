/**
 * The time zones a city may be saved with: the runtime's canonical IANA names (research §12).
 * Aliases such as `US/Eastern` still work where a city is read (`isValidTimeZone`), but the
 * admin saves only names from this list, so the browser and the server agree.
 */
let cached: readonly string[] | undefined;

export function supportedTimeZones(): readonly string[] {
  cached ??= [...Intl.supportedValuesOf('timeZone')].sort();
  return cached;
}

export function isSupportedTimeZone(timeZone: string): boolean {
  return supportedTimeZones().includes(timeZone);
}
