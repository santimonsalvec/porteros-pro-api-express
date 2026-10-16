/** The official codes of a municipality, checked when the admin creates or edits one (billing, spec 031). */

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
