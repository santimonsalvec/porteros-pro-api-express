import { describe, expect, it } from 'vitest';
import { City } from '../../../src/domain/locations/city.js';
import { Country } from '../../../src/domain/countries/country.js';
import { Region } from '../../../src/domain/locations/region.js';
import { adminGet, memberWith } from '../financeTestHelpers.js';
import { buildTestApp } from '../testAppFactory.js';
import { signInStaff } from '../adminTestHelpers.js';
import { signInClient } from '../walletTestHelpers.js';

// Admin spec 008 (contracts/dashboard-system-api.md §1).

async function world() {
  const context = await buildTestApp();
  context.countryRepository.seed(new Country({ id: 'country-co', name: 'Colombia', dialCode: '+57', countryCode: 'CO', currency: 'COP' }));
  context.countryRepository.seed(new Country({ id: 'country-mx', name: 'México', dialCode: '+52', countryCode: 'MX', currency: 'MXN' }));
  context.regionRepository.seed(new Region({ id: 'region-antioquia-co', name: 'Antioquia', countryId: 'country-co' }));
  context.regionRepository.seed(new Region({ id: 'region-cdmx', name: 'Ciudad de México', countryId: 'country-mx' }));
  context.cityRepository.seed(new City({ id: 'city-medellin-co', name: 'Medellín', regionId: 'region-antioquia-co', zoneCityId: null, timeZone: 'America/Bogota' }));
  context.cityRepository.seed(new City({ id: 'city-cdmx', name: 'Ciudad de México', regionId: 'region-cdmx', zoneCityId: null, timeZone: 'America/Mexico_City' }));
  const owner = await signInStaff(context, { key: 'owner', userId: 'owner-user' });
  return { context, owner };
}

describe('the admin dashboard summary (spec 008 of the admin)', () => {
  it('refuses without a session, with an app token and without dashboard.read (audited as denied)', async () => {
    const { context } = await world();
    const client = await signInClient(context, 'sub-8001');
    const member = await memberWith(context, 'casos', ['cases.read']);
    expect((await adminGet(context, '/admin/dashboard/summary')).status).toBe(401);
    expect((await adminGet(context, '/admin/dashboard/summary', client.token)).status).toBe(401);
    const denied = await adminGet(context, '/admin/dashboard/summary', member.token);
    expect(denied.status).toBe(403);
    expect(context.adminAuditLog.entries).toContainEqual(expect.objectContaining({ outcome: 'denied', permission: 'dashboard.read' }));
  });

  it('refuses a malformed or impossible scope', async () => {
    const { context, owner } = await world();
    const codes = async (query: string) => {
      const response = await adminGet(context, `/admin/dashboard/summary?${query}`, owner.token);
      return [response.status, response.body.error?.code ?? response.body.error];
    };
    expect(await codes('cityId=city-medellin-co')).toEqual([400, 'validation_failed']);
    expect(await codes('countryId=country-co&color=red')).toEqual([400, 'validation_failed']);
    expect(await codes('countryId=country-mx&cityId=city-medellin-co')).toEqual([400, 'city_not_in_country']);
    expect(await codes('countryId=nope')).toEqual([404, 'country_not_found']);
    expect(await codes('countryId=country-co&cityId=nope')).toEqual([404, 'city_not_found']);
  });

  it('answers no areas to a member who can only see the dashboard, and audits no read', async () => {
    const { context } = await world();
    const member = await memberWith(context, 'panel', ['dashboard.read']);
    context.adminAuditLog.entries.length = 0;

    const response = await adminGet(context, '/admin/dashboard/summary?countryId=country-co&cityId=city-medellin-co', member.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      computedAt: expect.any(String),
      scope: {
        countryId: 'country-co',
        cityId: 'city-medellin-co',
        timeZone: 'America/Bogota',
        timeZoneSource: 'city',
        timeZoneFallback: null,
        today: { from: expect.any(String), to: expect.any(String) },
        week: { from: expect.any(String), to: expect.any(String) },
      },
      areas: {},
    });
    expect(context.adminAuditLog.entries).toEqual([]);
  });

  it('lists the countries and cities of the filter to anyone with dashboard.read', async () => {
    const { context } = await world();
    const member = await memberWith(context, 'panel', ['dashboard.read']);
    const other = await memberWith(context, 'casos', ['cases.read']);

    const response = await adminGet(context, '/admin/dashboard/areas', member.token);

    expect(response.status).toBe(200);
    expect(response.body.countries).toEqual(expect.arrayContaining([{ id: 'country-co', name: 'Colombia', countryCode: 'CO' }]));
    expect(response.body.cities).toEqual(
      expect.arrayContaining([
        { id: 'city-medellin-co', name: 'Medellín', countryId: 'country-co' },
        { id: 'city-cdmx', name: 'Ciudad de México', countryId: 'country-mx' },
      ]),
    );
    expect((await adminGet(context, '/admin/dashboard/areas', other.token)).status).toBe(403);
  });

  it('gives the operations areas to a member who may see them, with every status and the week by day', async () => {
    const { context } = await world();
    const member = await memberWith(context, 'operacion', ['dashboard.read', 'requests.read', 'goalkeepers.read', 'goalkeepers.registrations.review', 'cases.read']);
    context.dashboardReader.areas.cases = { open: 4 };

    const response = await adminGet(context, '/admin/dashboard/summary', member.token);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.areas).sort()).toEqual(['cases', 'goalkeepers', 'registrations', 'requests']);
    expect(response.body.areas.cases).toEqual({ status: 'ok', open: 4 });
    const { requests } = response.body.areas;
    expect(Object.keys(requests.requests.today.byStatus)).toEqual(['searching', 'partially_assigned', 'assigned', 'completed', 'cancelled', 'expired', 'closed']);
    expect(Object.keys(requests.bookings.week.byStatus)).toEqual(['pending_assignment', 'assigned', 'cancelled', 'expired', 'goalkeeper_withdrew', 'completed']);
    expect(requests.bookings.weekByDay).toHaveLength(7);
    expect(response.body.areas.goalkeepers).toEqual({ status: 'ok', active: 0, available: 0, suspended: 0, blocked: 0 });
  });

  it('shows only the requests area with requests.read alone, and an area that failed as failed', async () => {
    const { context } = await world();
    const member = await memberWith(context, 'solicitudes', ['dashboard.read', 'requests.read', 'cases.read']);
    context.dashboardReader.failing.add('cases');

    const response = await adminGet(context, '/admin/dashboard/summary', member.token);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.areas).sort()).toEqual(['cases', 'requests']);
    expect(response.body.areas.cases).toEqual({ status: 'failed' });
    expect(response.body.areas.requests.status).toBe('ok');
  });

  it('gives the money areas with their permissions, one row per currency', async () => {
    const { context } = await world();
    const member = await memberWith(context, 'finanzas', ['dashboard.read', 'invoicing.read', 'topups.read', 'wallets.read']);
    context.dashboardReader.areas.wallets = {
      byCurrency: [
        { currency: 'COP', balanceTotal: 4_820_000, debtTotal: -126_400, negativeCount: 7 },
        { currency: 'USD', balanceTotal: 1_200, debtTotal: 0, negativeCount: 0 },
      ],
    };

    const response = await adminGet(context, '/admin/dashboard/summary?countryId=country-co', member.token);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.areas).sort()).toEqual(['invoicing', 'topUps', 'wallets']);
    expect(response.body.areas.invoicing).toEqual({ status: 'ok', rejected: 0, stale: 0 });
    expect(response.body.areas.topUps).toEqual({ status: 'ok', pending: 0 });
    expect(response.body.areas.wallets.byCurrency).toHaveLength(2);
    expect(response.body.scope).toMatchObject({ countryId: 'country-co', timeZoneSource: 'country', timeZone: 'America/Bogota' });
  });
});
