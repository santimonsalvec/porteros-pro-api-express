import type { Country } from '../../../../domain/countries/country.js';
import { isInvoiceableDocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { City } from '../../../../domain/locations/city.js';
import { daneCodesValid } from '../../../../domain/locations/locationRules.js';
import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../../domain/pricing/invalidConfigurationError.js';
import type { IDocumentTypeRepository } from '../../goalkeepers/common/ports.js';
import { areaSettingsFrom } from '../../goalkeeperRequests/common/serviceArea.js';
import { isValidTimeZone } from '../../goalkeeperRequests/common/zonedTime.js';
import type { IInvoicingSettingsRepository } from '../../invoicing/common/ports.js';
import type { IPaymentGatewaySettingsRepository } from '../../payments/common/ports.js';
import type { ICommissionSettingRepository, ITaxSettingsRepository } from '../../wallet/common/ports.js';
import type {
  IAdminCityRepository,
  IAdminCountryRepository,
  IAdminRegionRepository,
  IAdminZoneRepository,
  IBookingSettingsBatch,
  IRatePresence,
  IReadinessSummary,
  ReadinessSummary,
} from './ports.js';

/**
 * What a country or an operating city still needs to quote (business-settings §17, admin spec
 * 003 US3). It reads the same data and runs the same functions as the quote, so "ready" means a
 * quote there does not fail for configuration (FR-023).
 */

export type ReadinessTarget =
  | {
      kind: 'admin';
      screen:
        | 'city'
        | 'region'
        | 'country'
        | 'zones'
        | 'documentTypes'
        // Prices and booking rules (admin spec 004): a city's, or a country's.
        | 'rentalRates'
        | 'commissions'
        | 'countryCommissions'
        | 'bookingSettings'
        | 'countryBookingSettings'
        | 'taxSettings';
      id?: string;
    }
  | { kind: 'guide'; section: string };

export interface ReadinessItem {
  key: string;
  status: 'ok' | 'missing' | 'optional';
  detail: string;
  target: ReadinessTarget;
}

export interface ReadinessResult extends ReadinessSummary {
  items: ReadinessItem[];
}

export interface ReadinessDependencies {
  countries: IAdminCountryRepository;
  regions: IAdminRegionRepository;
  cities: IAdminCityRepository;
  zones: IAdminZoneRepository;
  bookingSettings: IBookingSettingsBatch;
  rentalRates: IRatePresence;
  commissions: ICommissionSettingRepository;
  taxSettings: ITaxSettingsRepository;
  gatewaySettings: IPaymentGatewaySettingsRepository;
  invoicingSettings: IInvoicingSettingsRepository;
  documentTypes: IDocumentTypeRepository;
}

const DURATIONS = [60, 90, 120] as const;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

const guide = (section: string): ReadinessTarget => ({ kind: 'guide', section });
const admin = (screen: Extract<ReadinessTarget, { kind: 'admin' }>['screen'], id?: string): ReadinessTarget => ({ kind: 'admin', screen, ...(id ? { id } : {}) });
const check = (key: string, ok: boolean, detail: string, target: ReadinessTarget, optional = false): ReadinessItem => ({
  key,
  status: ok ? 'ok' : optional ? 'optional' : 'missing',
  detail,
  target,
});

function summarize(items: ReadinessItem[]): ReadinessResult {
  const missingCount = items.filter((item) => item.status === 'missing').length;
  return { items, ready: missingCount === 0, missingCount };
}

const listWords = (values: readonly (string | number)[]) =>
  values.length <= 1 ? values.join('') : `${values.slice(0, -1).join(', ')} y ${values.at(-1)}`;

/** One operating city: see `readinessForCities`. */
export async function cityReadiness(deps: ReadinessDependencies, city: City): Promise<ReadinessResult> {
  return (await readinessForCities(deps, [city])).get(city.id)!;
}

const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))];

/**
 * The checklist of several operating cities, read in four rounds whatever their number: their
 * anchors; the regions; countries, zones and rules; rates and commissions. Each round is one
 * query per source, so a dashboard costs the same with 3 cities or 30. A satellite is judged by
 * its anchor (where the quote happens), its DANE codes by itself.
 */
export async function readinessForCities(deps: ReadinessDependencies, cities: City[]): Promise<Map<string, ReadinessResult>> {
  if (cities.length === 0) return new Map();
  const known = new Map(cities.map((city) => [city.id, city]));
  const missingAnchors = unique(cities.map((city) => city.zoneCityId)).filter((id) => !known.has(id));
  for (const anchor of missingAnchors.length > 0 ? await deps.cities.getByIds(missingAnchors) : []) known.set(anchor.id, anchor);
  const anchorOf = (city: City) => (city.zoneCityId ? (known.get(city.zoneCityId) ?? city) : city);
  const anchors = unique(cities.map((city) => anchorOf(city).id)).map((id) => known.get(id)!);

  const regions = new Map((await deps.regions.getByIds(unique([...known.values()].map((city) => city.regionId)))).map((region) => [region.id, region]));
  const countryIdOf = (city: City) => regions.get(city.regionId)?.countryId ?? null;
  const countryIds = unique([...known.values()].map(countryIdOf));
  const anchorIds = anchors.map((anchor) => anchor.id);

  const [countries, zones, settings] = await Promise.all([
    deps.countries.getByIds(countryIds),
    deps.zones.summariesByCities(anchorIds),
    deps.bookingSettings.findMany({ cityIds: anchorIds, countryIds }),
  ]);
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const activeZones = zones.filter((zone) => zone.active);
  const zoneIds = activeZones.map((zone) => zone.id);
  const [priced, commissions] = await Promise.all([
    deps.rentalRates.pricedDurations({ cityIds: anchorIds, zoneIds }),
    deps.commissions.findFor({ zoneIds, cityIds: anchorIds, countryIds }),
  ]);

  const results = new Map<string, ReadinessResult>();
  for (const city of cities) {
    const anchor = anchorOf(city);
    const anchorZoneIds = activeZones.filter((zone) => zone.cityId === anchor.id).map((zone) => zone.id);
    results.set(
      city.id,
      summarize(
        cityItems({
          city,
          anchor,
          regionName: regions.get(city.regionId)?.name ?? null,
          country: countryById.get(countryIdOf(city) ?? '') ?? null,
          anchorCountry: countryById.get(countryIdOf(anchor) ?? '') ?? null,
          zoneIds: anchorZoneIds,
          pricedDurations: priced
            .filter((rate) => (rate.scope === 'city' ? rate.refId === anchor.id : anchorZoneIds.includes(rate.refId)))
            .map((rate) => rate.durationMinutes),
          settings: {
            city: settings.find((item) => item.scope === 'city' && item.refId === anchor.id) ?? null,
            country: settings.find((item) => item.scope === 'country' && item.refId === countryIdOf(anchor)) ?? null,
          },
          commissions: commissions.filter(
            (item) =>
              (item.scope === 'zone' && anchorZoneIds.includes(item.refId)) ||
              (item.scope === 'city' && item.refId === anchor.id) ||
              (item.scope === 'country' && item.refId === countryIdOf(anchor)),
          ),
        }),
      ),
    );
  }
  return results;
}

interface CityFacts {
  city: City;
  anchor: City;
  regionName: string | null;
  country: Country | null;
  anchorCountry: Country | null;
  zoneIds: string[];
  pricedDurations: number[];
  settings: { city: BookingSettings | null; country: BookingSettings | null };
  commissions: { scope: string }[];
}

/** The checklist of one city from what was read (§17), in its order. */
function cityItems(facts: CityFacts): ReadinessItem[] {
  const { city, anchor, country, zoneIds, settings, commissions } = facts;
  const anchorName = anchor.id === city.id ? '' : ` (de ${anchor.name})`;
  const items: ReadinessItem[] = [
    check('region_country', country !== null, country ? `${facts.regionName} · ${country.name}` : 'La región no tiene país', admin('region', city.regionId)),
    check(
      'time_zone',
      anchor.timeZone !== null && isValidTimeZone(anchor.timeZone),
      anchor.timeZone ? `${anchor.timeZone}${anchorName}` : `Sin zona horaria${anchorName}`,
      admin('city', anchor.id),
    ),
  ];
  if (country?.countryCode === 'CO') {
    const complete = city.daneStateCode !== null && city.daneCityCode !== null && daneCodesValid(city.daneStateCode, city.daneCityCode);
    items.push(check('dane_codes', complete, complete ? `${city.daneStateCode} · ${city.daneCityCode}` : 'Faltan los códigos DANE', admin('city', city.id)));
  }
  const durations = DURATIONS.filter((duration) => facts.pricedDurations.includes(duration));
  const cityLevel = commissions.filter((item) => item.scope !== 'country');
  items.push(
    check(
      'zones',
      zoneIds.length > 0,
      zoneIds.length > 0 ? `${zoneIds.length} ${zoneIds.length === 1 ? 'zona activa' : 'zonas activas'}${anchorName}` : `Sin zonas activas${anchorName}`,
      admin('zones', anchor.id),
    ),
    check('rental_rates', durations.length > 0, durations.length > 0 ? `${listWords(durations)} min` : 'Sin tarifas', admin('rentalRates', anchor.id)),
    bookingSettingsItem(settings, facts.anchorCountry, anchor.id),
    check('commission', commissions.length > 0, commissions.length > 0 ? 'Configurada' : 'Sin comisión', admin('commissions', anchor.id)),
    check('city_booking_settings', settings.city !== null, settings.city ? 'Reglas propias de la ciudad' : 'Usa las del país', admin('bookingSettings', anchor.id), true),
    check('city_commission', cityLevel.length > 0, cityLevel.length > 0 ? 'Comisión propia' : 'Usa la del país', admin('commissions', anchor.id), true),
  );
  return items;
}

/** The quote's own judgement of the rules and currency (`areaSettingsFrom`). */
function bookingSettingsItem(settings: CityFacts['settings'], country: Country | null, anchorId: string): ReadinessItem {
  const target = admin('bookingSettings', anchorId);
  try {
    const result = areaSettingsFrom(settings, country);
    return check('booking_settings', result.ok, result.ok ? 'Completas' : `Falta: ${result.missing.join(', ')}`, target);
  } catch (error) {
    if (!(error instanceof InvalidConfigurationError)) throw error;
    return check('booking_settings', false, 'Hay un valor inválido en la configuración', target);
  }
}

const hasMinimumRules = (settings: BookingSettings | null) =>
  settings !== null && settings.bookingWindowDays !== null && settings.minNoticeMinutes !== null && settings.leadTimeSurcharge !== null;

export async function countryReadiness(deps: ReadinessDependencies, country: Country): Promise<ReadinessResult> {
  const [regions, settings, commissions, tax, gateway, invoicing, documentTypes] = await Promise.all([
    deps.regions.getByCountry(country.id),
    deps.bookingSettings.findMany({ cityIds: [], countryIds: [country.id] }),
    deps.commissions.findFor({ zoneIds: [], cityIds: [], countryIds: [country.id] }),
    deps.taxSettings.getByCountry(country.id),
    deps.gatewaySettings.getByCountry(country.id),
    deps.invoicingSettings.getByCountry(country.id),
    deps.documentTypes.getAll(),
  ]);
  const invoiceable = documentTypes.filter((type) => isInvoiceableDocumentType(type.code));
  return summarize([
    check('currency', country.currency !== null && CURRENCY.test(country.currency), country.currency ?? 'Sin moneda', admin('country', country.id)),
    check('country_code', COUNTRY_CODE.test(country.countryCode), country.countryCode, admin('country', country.id)),
    check('regions', regions.length > 0, `${regions.length} ${regions.length === 1 ? 'región' : 'regiones'}`, admin('region')),
    check('booking_settings', hasMinimumRules(settings[0] ?? null), hasMinimumRules(settings[0] ?? null) ? 'Completas' : 'Faltan reglas del país', admin('countryBookingSettings', country.id)),
    check('commission', commissions.length > 0, commissions.length > 0 ? 'Configurada' : 'Sin comisión del país', admin('countryCommissions', country.id)),
    check('tax', tax !== null, tax ? 'Configurado' : 'Sin IVA configurado', admin('taxSettings', country.id)),
    check('payment_gateway', gateway !== null, gateway ? 'Configurada' : 'Sin pasarela', guide('§12')),
    check('invoicing', invoicing !== null, invoicing ? 'Configurada' : 'Sin facturación', guide('§13')),
    check(
      'document_types',
      invoiceable.length > 0,
      invoiceable.length > 0 ? `${invoiceable.length} que se pueden facturar` : 'Ninguno se puede facturar',
      admin('documentTypes'),
    ),
  ]);
}

/** The city list's summary of each operating city (`IReadinessSummary`). */
export class ReadinessSummarizer implements IReadinessSummary {
  constructor(private readonly deps: ReadinessDependencies) {}

  async summarize(cities: City[]): Promise<Map<string, ReadinessSummary>> {
    const results = await readinessForCities(this.deps, cities);
    return new Map([...results].map(([id, { ready, missingCount }]) => [id, { ready, missingCount }]));
  }
}
