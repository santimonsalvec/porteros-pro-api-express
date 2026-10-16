import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { Zone } from '../../../src/domain/zones/zone.js';
import { POINTS } from '../../fixtures/quoteFixtures.js';
import { buildTestApp } from '../testAppFactory.js';
import { signInClient } from '../operatingBalanceTestHelpers.js';

type Context = Awaited<ReturnType<typeof buildTestApp>>;

const NOW = '2026-09-21T18:30:00.000Z';
const QUOTE = { startsAt: '2026-09-21T15:00:00', goalkeeperCount: 1, durationMinutes: 90, modality: 'any', surfaceId: 'synthetic_grass' };

const get = (context: Context, token: string, path: string) => request(context.app).get(path).set('Authorization', `Bearer ${token}`);
const post = (context: Context, token: string, path: string, body: object) => request(context.app).post(path).set('Authorization', `Bearer ${token}`).send(body);

function disable(context: Context, marketId: string) {
  context.marketRepository.seed(context.marketRepository.markets.get(marketId)!.disable('staff-1', new Date(NOW)));
}

function deactivate(context: Context, zoneId: string) {
  const zone = context.zoneRepository.zones.get(zoneId)!;
  context.zoneRepository.seed(new Zone({ ...zone, id: zone.id, active: false }));
}

async function setUp(sub: string) {
  const context = await buildTestApp();
  context.clock.set(NOW);
  const client = await signInClient(context, sub);
  return { context, token: client.token };
}

describe('GET /markets (spec 031, A1)', () => {
  it('lists only the enabled markets, by name, with what the map needs', async () => {
    const { context, token } = await setUp('sub-3101');
    disable(context, 'city-bogota');

    const markets = await get(context, token, '/markets');

    expect(markets.status).toBe(200);
    const names = markets.body.markets.map((market: { name: string }) => market.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b, 'es')));
    expect(names).not.toContain('Bogotá');
    expect(markets.body.markets.find((market: { id: string }) => market.id === 'city-cali')).toEqual({
      id: 'city-cali',
      name: 'Cali',
      countryId: 'country-co',
      timeZone: 'America/Bogota',
    });
    expect((await request(context.app).get('/markets')).status).toBe(401);
  });
});

describe('GET /zones?marketId= (spec 031, A2)', () => {
  it("answers an enabled market's active zones, and market_not_found otherwise", async () => {
    const { context, token } = await setUp('sub-3102');
    disable(context, 'city-bogota');

    const cali = await get(context, token, '/zones?marketId=city-cali');
    const bogota = await get(context, token, '/zones?marketId=city-bogota');
    const unknown = await get(context, token, '/zones?marketId=nope');

    expect(cali.status).toBe(200);
    expect(cali.body.zones.length).toBeGreaterThan(0);
    expect([bogota.status, bogota.body.error]).toEqual([404, 'market_not_found']);
    expect([unknown.status, unknown.body.error]).toEqual([404, 'market_not_found']);
  });
});

describe('quote and config in a market out of service (spec 031, A4)', () => {
  it('answers 409 market_unavailable with the market name in a disabled market', async () => {
    const { context, token } = await setUp('sub-3103');
    disable(context, 'city-cali');

    const quote = await post(context, token, '/goalkeeper-requests/quote', { ...POINTS.caliNorte, ...QUOTE });
    const config = await get(context, token, `/goalkeeper-requests/config?latitude=${POINTS.caliNorte.latitude}&longitude=${POINTS.caliNorte.longitude}`);

    expect([quote.status, quote.body.error, quote.body.marketName]).toEqual([409, 'market_unavailable', 'Cali']);
    expect([config.status, config.body.error, config.body.marketName]).toEqual([409, 'market_unavailable', 'Cali']);
  });

  it('answers 409 market_unavailable in an inactive zone of an enabled market', async () => {
    const { context, token } = await setUp('sub-3104');
    deactivate(context, 'zone-cali-norte');

    const quote = await post(context, token, '/goalkeeper-requests/quote', { ...POINTS.caliNorte, ...QUOTE });

    expect([quote.status, quote.body.error]).toEqual([409, 'market_unavailable']);
  });

  it('keeps 400 location_not_covered far from every zone', async () => {
    const { context, token } = await setUp('sub-3105');
    const quote = await post(context, token, '/goalkeeper-requests/quote', { latitude: 0, longitude: 0, ...QUOTE });
    expect([quote.status, quote.body.error]).toEqual([400, 'location_not_covered']);
  });
});

describe('confirming after the market is disabled (spec 031, A5)', () => {
  it('refuses a quote issued before the market was disabled', async () => {
    const { context, token } = await setUp('sub-3106');
    const quote = await post(context, token, '/goalkeeper-requests/quote', { ...POINTS.caliNorte, ...QUOTE });
    expect(quote.status).toBe(200);
    disable(context, 'city-cali');

    const confirmed = await post(context, token, '/goalkeeper-requests/bookings', { quoteId: quote.body.quoteId });

    expect([confirmed.status, confirmed.body.error, confirmed.body.marketName]).toEqual([409, 'market_unavailable', 'Cali']);
  });
});
