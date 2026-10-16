import { describe, expect, it } from 'vitest';
import { Market, MarketTransitionError, marketFieldIssues, nameKeyOf } from '../../../../src/domain/markets/market.js';

const now = new Date('2026-10-15T12:00:00Z');
const later = new Date('2026-10-16T12:00:00Z');

const create = () =>
  Market.create(
    {
      id: 'mkt-1',
      name: '  Medellín  ',
      countryId: 'co',
      timeZone: 'America/Bogota',
      mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 },
      createdBy: 'staff-1',
    },
    now,
  );

describe('Market.create', () => {
  it('starts as a draft with a trimmed name and no state history', () => {
    const market = create();
    expect(market.status).toBe('draft');
    expect(market.name).toBe('Medellín');
    expect(market.enabledAt).toBeNull();
    expect(market.disabledAt).toBeNull();
    expect(market.createdAt).toEqual(now);
    expect(market.createdBy).toBe('staff-1');
    expect(market.revision).toBe(0);
  });
});

describe('marketFieldIssues', () => {
  const valid = { name: 'Medellín', countryId: 'co', timeZone: 'America/Bogota', mapCenter: { lat: 6.25, lng: -75.56, zoom: 12 } };

  it('accepts valid fields', () => {
    expect(marketFieldIssues(valid)).toEqual([]);
  });

  it.each([
    [{ name: 'M' }, 'name'],
    [{ name: 'x'.repeat(61) }, 'name'],
    [{ countryId: '' }, 'countryId'],
    [{ timeZone: ' ' }, 'timeZone'],
    [{ mapCenter: { lat: 91, lng: 0, zoom: 12 } }, 'mapCenter'],
    [{ mapCenter: { lat: 0, lng: -181, zoom: 12 } }, 'mapCenter'],
    [{ mapCenter: { lat: 0, lng: 0, zoom: 2 } }, 'mapCenter'],
    [{ mapCenter: { lat: 0, lng: 0, zoom: 21 } }, 'mapCenter'],
  ])('reports %j', (change, field) => {
    expect(marketFieldIssues({ ...valid, ...change })).toContain(field);
  });
});

describe('Market transitions', () => {
  it('enables a draft and records who and when', () => {
    const market = create().enable('staff-2', later);
    expect(market.status).toBe('enabled');
    expect(market.enabledAt).toEqual(later);
    expect(market.enabledBy).toBe('staff-2');
  });

  it('disables an enabled market and enables it again', () => {
    const disabled = create().enable('s', now).disable('staff-3', later);
    expect(disabled.status).toBe('disabled');
    expect(disabled.disabledAt).toEqual(later);
    expect(disabled.disabledBy).toBe('staff-3');
    expect(disabled.enable('s', later).status).toBe('enabled');
  });

  it('refuses to disable a market that is not enabled', () => {
    expect(() => create().disable('s', now)).toThrow(MarketTransitionError);
  });

  it('refuses to enable an enabled market', () => {
    expect(() => create().enable('s', now).enable('s', now)).toThrow(MarketTransitionError);
  });

  it('has no way back to draft', () => {
    expect('toDraft' in create()).toBe(false);
  });
});

describe('Market.withEdits', () => {
  it('changes name, time zone and map centre, never the country', () => {
    const edited = create().withEdits({ name: 'Medellín centro', timeZone: 'America/Lima', mapCenter: { lat: 1, lng: 2, zoom: 10 } });
    expect(edited.name).toBe('Medellín centro');
    expect(edited.timeZone).toBe('America/Lima');
    expect(edited.mapCenter).toEqual({ lat: 1, lng: 2, zoom: 10 });
    expect(edited.countryId).toBe('co');
  });
});

describe('nameKeyOf', () => {
  it('ignores case, accents and surrounding spaces', () => {
    expect(nameKeyOf('  MEDELLÍN ')).toBe(nameKeyOf('medellin'));
  });
});

describe('Market revision', () => {
  it('rejects a broken revision', () => {
    expect(() => Market.fromStored({ ...create().toProps(), revision: -1 })).toThrow(/markets document mkt-1: revision/);
  });
});
