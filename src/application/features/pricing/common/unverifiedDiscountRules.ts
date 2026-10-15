import { ADMIN_LIMITS } from '../../../../domain/pricing/adminLimits.js';
import type { UnverifiedFields } from './ports.js';

/**
 * Why the admin cannot save these values, field by field, or null (FR-018a): whole basis points
 * from 0 to the 30 % ceiling, whole minutes from 0 to a day, and at least one of the two set.
 */
export function unverifiedFieldErrors(fields: UnverifiedFields): Record<string, string> | null {
  const errors: Record<string, string> = {};
  const { discountBps, verifiedPriorityMinutes } = fields;
  if (discountBps !== null) {
    if (!Number.isInteger(discountBps) || discountBps < 0) errors['discountBps'] = 'discountBps must be a whole number of basis points of at least 0';
    else if (discountBps > ADMIN_LIMITS.unverifiedDiscountBps) errors['discountBps'] = `discountBps must be at most ${ADMIN_LIMITS.unverifiedDiscountBps}`;
  }
  if (verifiedPriorityMinutes !== null && (!Number.isInteger(verifiedPriorityMinutes) || verifiedPriorityMinutes < 0 || verifiedPriorityMinutes > ADMIN_LIMITS.verifiedPriorityMinutes)) {
    errors['verifiedPriorityMinutes'] = `verifiedPriorityMinutes must be a whole number between 0 and ${ADMIN_LIMITS.verifiedPriorityMinutes}`;
  }
  if (discountBps === null && verifiedPriorityMinutes === null) errors['discountBps'] = 'Set the discount, the priority window or both';
  return Object.keys(errors).length > 0 ? errors : null;
}
