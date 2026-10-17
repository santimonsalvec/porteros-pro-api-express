import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');

/** What the goalkeeper reads: available matches, the agenda, the acceptance and the operating balance. */
const GOALKEEPER_FACING = [
  'src/application/features/goalkeeperRequests/common/goalkeeperBookingResponse.ts',
  'src/application/features/goalkeeperRequests/queries/listAvailableBookings/listAvailableBookingsQuery.ts',
  'src/application/features/goalkeeperRequests/queries/listGoalkeeperAgenda/listGoalkeeperAgendaQuery.ts',
  'src/application/features/operatingBalance/queries/getGoalkeeperOperatingBalance/getGoalkeeperOperatingBalanceQuery.ts',
];

/** The breakdown of a commission is the team's (spec 033, FR-024): the goalkeeper sees one net amount, its VAT and the total. */
const BREAKDOWN_FIELDS = ['commissionBreakdown', 'percentBps', 'fixedAmount', 'percentAmount'];

describe('goalkeeper payloads never carry the commission breakdown (spec 033, FR-024)', () => {
  it.each(GOALKEEPER_FACING)('%s names no breakdown field', (file) => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    for (const field of BREAKDOWN_FIELDS) expect(source, `${file} mentions ${field}`).not.toContain(field);
  });

  it('the OpenAPI document (the app’s contract) describes no commission breakdown', () => {
    const source = readFileSync(join(ROOT, 'src/infrastructure/openapi/openapiSpec.ts'), 'utf8');
    // `percentBps` also names a deposit gateway cost there, so only the breakdown's own fields are forbidden.
    for (const field of ['commissionBreakdown', 'percentAmount', 'fixedAmount']) expect(source, `openapi mentions ${field}`).not.toContain(field);
  });
});
