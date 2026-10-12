import { describe, expect, it } from 'vitest';
import { zonesLeftWithout, type ImpactZone } from '../../../../../../src/application/features/pricing/common/deleteImpact.js';

const zones: ImpactZone[] = [
  { id: 'bello', name: 'Bello', active: true },
  { id: 'poblado', name: 'El Poblado', active: true },
  { id: 'robledo', name: 'Robledo', active: false },
];
const cityRate = { id: 'city-90', invalid: false };
const belloRate = { id: 'bello-90', invalid: false };
const covering = (zone: ImpactZone) => (zone.id === 'bello' ? [belloRate, cityRate] : [cityRate]);

describe('zonesLeftWithout', () => {
  it('counts the active zones the removed record was the only one covering', () => {
    expect(zonesLeftWithout('city-90', zones, covering)).toEqual({ zoneCount: 1, zoneNames: ['El Poblado'] });
  });

  it('counts nothing when another record still covers each zone', () => {
    expect(zonesLeftWithout('bello-90', zones, covering)).toEqual({ zoneCount: 0, zoneNames: [] });
  });

  it('ignores a remaining record the domain refuses: the quote could not use it', () => {
    const broken = (zone: ImpactZone) => (zone.id === 'bello' ? [{ ...belloRate, invalid: true }, cityRate] : [cityRate]);
    expect(zonesLeftWithout('city-90', zones, broken)).toEqual({ zoneCount: 2, zoneNames: ['Bello', 'El Poblado'] });
  });

  it('leaves out inactive zones and zones the record never covered', () => {
    expect(zonesLeftWithout('other', zones, covering)).toEqual({ zoneCount: 0, zoneNames: [] });
  });
});
