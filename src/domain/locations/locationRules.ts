/**
 * Rules for the anchor city (business-settings §2) and the official codes of a city, checked
 * when the admin creates or edits one. Pure: the caller gathers the facts.
 */

/** A city may use `anchor`'s zones only when it is another city that owns zones itself (no chains). */
export function canUseAnchor(cityId: string, anchor: { id: string; zoneCityId: string | null } | null): boolean {
  return anchor !== null && anchor.id !== cityId && anchor.zoneCityId === null;
}

/** A city keeps being an anchor while it has zones of its own or other cities use them. */
export function canStopBeingAnchor(hasZones: boolean, isAnchorOfOthers: boolean): boolean {
  return !hasZones && !isAnchorOfOthers;
}

const STATE_CODE = /^[0-9]{2}$/;
const CITY_CODE = /^[0-9]{5}$/;

/**
 * DANE codes: the department in 2 digits, the municipality in 5 that start with the
 * department's. A municipality without its department is incomplete.
 */
export function daneCodesValid(stateCode: string | null, cityCode: string | null): boolean {
  if (stateCode !== null && !STATE_CODE.test(stateCode)) return false;
  if (cityCode === null) return true;
  return stateCode !== null && CITY_CODE.test(cityCode) && cityCode.startsWith(stateCode);
}
