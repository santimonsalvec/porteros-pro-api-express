import { describe, expect, it } from 'vitest';
import type { Document } from 'mongodb';
import { requestStatusFromCounts, type BookingCounts, type RequestStatus } from '../../../../../src/domain/bookings/requestStatus.js';
import { requestStatusBranches, requestStatusExpression, statusMatch } from '../../../../../src/infrastructure/persistence/mongo/requestAdminPipelines.js';

const FIELDS: (keyof BookingCounts)[] = ['pending', 'assigned', 'completed', 'cancelled', 'expired'];
const STATUSES: RequestStatus[] = ['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed'];

/** Every combination of 0 or 1 booking in each status. */
const combinations: BookingCounts[] = Array.from({ length: 2 ** FIELDS.length }, (_, bits) =>
  Object.fromEntries(FIELDS.map((field, index) => [field, (bits >> index) & 1])) as unknown as BookingCounts,
);

/** Evaluates the `$match` of `statusMatch` (only `$and`, `$gt: 0` and `$eq: 0`). */
function matches(query: Document, counts: BookingCounts): boolean {
  return (query.$and as Document[]).every((condition) => {
    const [field, test] = Object.entries(condition)[0]! as [keyof BookingCounts, Document];
    return '$gt' in test ? counts[field] > test.$gt : counts[field] === test.$eq;
  });
}

/** Evaluates the `$switch` of `requestStatusExpression` (only `$and`, `$gt` and `$eq` on `$field` and 0). */
function evaluate(expression: Document, counts: BookingCounts): string {
  const { branches, default: otherwise } = expression.$switch as { branches: { case: Document; then: string }[]; default: string };
  const holds = (condition: Document) => {
    const [operator, [path, value]] = Object.entries(condition)[0]! as [string, [string, number]];
    const actual = counts[path.slice(1) as keyof BookingCounts];
    return operator === '$gt' ? actual > value : actual === value;
  };
  return branches.find((branch) => (branch.case.$and as Document[]).every(holds))?.then ?? otherwise;
}

describe('requestStatusBranches (admin spec 008, research §3)', () => {
  it('has one rule per status', () => {
    expect(requestStatusBranches().map((branch) => branch.status)).toEqual(STATUSES);
  });

  it.each(combinations)('the list filter and the dashboard expression agree with the domain for %o', (counts) => {
    const expected = requestStatusFromCounts(counts);
    expect(STATUSES.filter((status) => matches(statusMatch(status), counts))).toEqual([expected]);
    expect(evaluate(requestStatusExpression(), counts)).toBe(expected);
  });
});
