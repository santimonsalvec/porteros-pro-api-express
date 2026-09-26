import { beforeEach, describe, expect, it } from 'vitest';
import { IssueServiceQuoteCommand } from '../../../../../src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommand.js';
import { IssueServiceQuoteCommandHandler } from '../../../../../src/application/features/goalkeeperRequests/commands/issueServiceQuote/issueServiceQuoteCommandHandler.js';
import { parseStartsAt } from '../../../../../src/application/features/goalkeeperRequests/common/startsAt.js';
import {
  GetServiceQuoteQuery,
  type GetServiceQuoteResult,
  type ServiceQuoteInput,
} from '../../../../../src/application/features/goalkeeperRequests/queries/getServiceQuote/getServiceQuoteQuery.js';
import { FixedClock } from '../../../../fakes/fakeClock.js';
import { FakeQuoteRepository } from '../../../../fakes/fakeQuoteRepository.js';
import { FakeSender } from '../../../../fakes/fakeSender.js';
import { POINTS, QUOTE_NOW } from '../../../../fixtures/quoteFixtures.js';

const priced = {
  unitRate: 55000,
  goalkeeperCount: 2 as const,
  subtotal: 110000,
  unitSurcharge: 5000,
  surcharge: 10000,
  total: 120000,
  currency: 'COP',
  startsAt: '2026-09-21T20:00:00.000Z',
  startsAtLocal: '2026-09-21T15:00:00-05:00',
  timeZone: 'America/Bogota',
};
const success: GetServiceQuoteResult = {
  outcome: 'success',
  quote: priced,
  area: { zoneId: 'zone-cali-norte', cityId: 'city-cali' },
};
const input: ServiceQuoteInput = {
  ...POINTS.caliNorte,
  startsAt: parseStartsAt('2026-09-21T15:00:00')!,
  goalkeeperCount: 2,
  durationMinutes: 90,
};

class Harness {
  readonly sender = new FakeSender();
  readonly quotes = new FakeQuoteRepository();
  readonly clock = new FixedClock(QUOTE_NOW);
  private counter = 0;
  readonly handler = new IssueServiceQuoteCommandHandler(
    this.sender,
    this.quotes,
    { newId: () => `quote-${++this.counter}` },
    this.clock,
  );

  issue(clientId = 'client-a') {
    return this.handler.handle(new IssueServiceQuoteCommand(clientId, input));
  }
}

let h: Harness;
beforeEach(() => {
  h = new Harness();
});

describe('IssueServiceQuoteCommandHandler — Story 3: every quote is recorded', () => {
  it('stores the priced quote as pending, expiring 3 minutes after issuance', async () => {
    h.sender.respondWith(GetServiceQuoteQuery, success);

    await h.issue();

    const [stored] = h.quotes.all();
    expect(h.quotes.all()).toHaveLength(1);
    expect(stored).toMatchObject({ id: 'quote-1', clientId: 'client-a', status: 'pending' });
    expect(stored!.issuedAt).toEqual(new Date(QUOTE_NOW));
    expect(stored!.expiresAt).toEqual(new Date('2026-09-21T18:03:00.000Z'));
    expect(stored!.match).toMatchObject({
      ...POINTS.caliNorte,
      zoneId: 'zone-cali-norte',
      cityId: 'city-cali',
      startsAt: new Date('2026-09-21T20:00:00.000Z'),
      startsAtLocal: '2026-09-21T15:00:00-05:00',
      timeZone: 'America/Bogota',
      goalkeeperCount: 2,
      durationMinutes: 90,
    });
    expect(stored!.pricing).toMatchObject({
      unitRate: 55000,
      subtotal: 110000,
      unitSurcharge: 5000,
      surcharge: 10000,
      total: 120000,
      currency: 'COP',
    });
  });

  it('returns every 007 field unchanged plus the quote id and expiry', async () => {
    h.sender.respondWith(GetServiceQuoteQuery, success);

    const result = await h.issue();

    expect(result).toEqual({
      outcome: 'success',
      quote: { ...priced, quoteId: 'quote-1', expiresAt: '2026-09-21T18:03:00.000Z' },
    });
  });

  it('prices exactly the input it was given', async () => {
    h.sender.respondWith(GetServiceQuoteQuery, success);

    await h.issue();

    expect(h.sender.sent).toHaveLength(1);
    expect((h.sender.sent[0] as GetServiceQuoteQuery).input).toBe(input);
  });

  it.each<GetServiceQuoteResult>([
    { outcome: 'location_not_covered' },
    { outcome: 'insufficient_notice', minNoticeMinutes: 30 },
    {
      outcome: 'rate_not_configured',
      zoneId: 'zone-cali-norte',
      cityId: 'city-cali',
      durationMinutes: 90,
    },
  ])('passes the refusal $outcome through and stores nothing', async (refusal) => {
    h.sender.respondWith(GetServiceQuoteQuery, refusal);

    const result = await h.issue();

    expect(result).toEqual(refusal);
    expect(h.quotes.all()).toHaveLength(0);
  });

  it('stores two independent quotes for the same match', async () => {
    h.sender.respondWith(GetServiceQuoteQuery, success);

    const first = await h.issue();
    const second = await h.issue();

    expect(h.quotes.all()).toHaveLength(2);
    expect(first).not.toEqual(second);
  });

  it('fails (and returns no price) when the quote cannot be stored', async () => {
    h.sender.respondWith(GetServiceQuoteQuery, success);
    h.quotes.failNextAdd(new Error('db down'));

    await expect(h.issue()).rejects.toThrow('db down');
    expect(h.quotes.all()).toHaveLength(0);
  });
});
