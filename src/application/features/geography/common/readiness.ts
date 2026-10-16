import type { Country } from '../../../../domain/countries/country.js';
import { isInvoiceableDocumentType } from '../../../../domain/goalkeepers/documentType.js';
import type { Market } from '../../../../domain/markets/market.js';
import type { BookingSettings } from '../../../../domain/pricing/bookingSettings.js';
import { InvalidConfigurationError } from '../../../../domain/pricing/invalidConfigurationError.js';
import type { IDocumentTypeRepository } from '../../goalkeepers/common/ports.js';
import { areaSettingsFrom } from '../../goalkeeperRequests/common/serviceArea.js';
import { isValidTimeZone } from '../../goalkeeperRequests/common/zonedTime.js';
import type { IInvoicingSettingsRepository } from '../../invoicing/common/ports.js';
import type { IPaymentGatewaySettingsRepository } from '../../payments/common/ports.js';
import type { ICommissionSettingRepository, ITaxSettingsRepository } from '../../operatingBalance/common/ports.js';
import type {
  IAdminCountryRepository,
  IAdminRegionRepository,
  IAdminZoneRepository,
  IBookingSettingsBatch,
  IRatePresence,
  IReadinessSummary,
  ReadinessSummary,
} from './ports.js';

/**
 * What a country or a market still needs to quote (business-settings §17, admin spec 003 US3;
 * spec 031, FR-008). It reads the same data and runs the same functions as the quote, so "ready"
 * means a quote there does not fail for configuration (SC-003).
 */

export type ReadinessTarget =
  | {
      kind: 'admin';
      screen:
        | 'market'
        | 'region'
        | 'country'
        | 'zones'
        | 'documentTypes'
        // Prices and booking rules (admin spec 004): a market's, or a country's.
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

/** One market: see `readinessForMarkets`. */
export async function marketReadiness(deps: ReadinessDependencies, market: Market): Promise<ReadinessResult> {
  return (await readinessForMarkets(deps, [market])).get(market.id)!;
}

const unique = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))];

/**
 * The checklist of several markets, read in two rounds whatever their number: countries, zones
 * and rules; then rates and commissions. Each round is one query per source, so a dashboard costs
 * the same with 3 markets or 30.
 */
export async function readinessForMarkets(deps: ReadinessDependencies, markets: readonly Market[]): Promise<Map<string, ReadinessResult>> {
  if (markets.length === 0) return new Map();
  const marketIds = markets.map((market) => market.id);
  const countryIds = unique(markets.map((market) => market.countryId));

  const [countries, zones, settings] = await Promise.all([
    deps.countries.getByIds(countryIds),
    deps.zones.summariesByMarkets(marketIds),
    deps.bookingSettings.findMany({ marketIds, countryIds }),
  ]);
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const activeZones = zones.filter((zone) => zone.active);
  const zoneIds = activeZones.map((zone) => zone.id);
  const [priced, commissions] = await Promise.all([
    deps.rentalRates.pricedDurations({ marketIds, zoneIds }),
    deps.commissions.findFor({ zoneIds, marketIds, countryIds }),
  ]);

  const results = new Map<string, ReadinessResult>();
  for (const market of markets) {
    const marketZoneIds = activeZones.filter((zone) => zone.marketId === market.id).map((zone) => zone.id);
    results.set(
      market.id,
      summarize(
        marketItems({
          market,
          country: countryById.get(market.countryId) ?? null,
          zoneIds: marketZoneIds,
          pricedDurations: priced
            .filter((rate) => (rate.scope === 'market' ? rate.refId === market.id : marketZoneIds.includes(rate.refId)))
            .map((rate) => rate.durationMinutes),
          settings: {
            market: settings.find((item) => item.scope === 'market' && item.refId === market.id) ?? null,
            country: settings.find((item) => item.scope === 'country' && item.refId === market.countryId) ?? null,
          },
          commissions: commissions.filter(
            (item) =>
              (item.scope === 'zone' && marketZoneIds.includes(item.refId)) ||
              (item.scope === 'market' && item.refId === market.id) ||
              (item.scope === 'country' && item.refId === market.countryId),
          ),
        }),
      ),
    );
  }
  return results;
}

interface MarketFacts {
  market: Market;
  country: Country | null;
  zoneIds: string[];
  pricedDurations: number[];
  settings: { market: BookingSettings | null; country: BookingSettings | null };
  commissions: { scope: string }[];
}

/** The checklist of one market from what was read (§17), in its order. */
function marketItems(facts: MarketFacts): ReadinessItem[] {
  const { market, country, zoneIds, settings, commissions } = facts;
  const durations = DURATIONS.filter((duration) => facts.pricedDurations.includes(duration));
  const marketLevel = commissions.filter((item) => item.scope !== 'country');
  return [
    check('country', country !== null && country.currency !== null, country ? `${country.name} · ${country.currency ?? 'sin moneda'}` : 'El país no existe', admin('country', market.countryId)),
    check('time_zone', isValidTimeZone(market.timeZone), market.timeZone, admin('market', market.id)),
    check(
      'zones',
      zoneIds.length > 0,
      zoneIds.length > 0 ? `${zoneIds.length} ${zoneIds.length === 1 ? 'zona activa' : 'zonas activas'}` : 'Sin zonas activas',
      admin('zones', market.id),
    ),
    check('rental_rates', durations.length > 0, durations.length > 0 ? `${listWords(durations)} min` : 'Sin tarifas', admin('rentalRates', market.id)),
    bookingSettingsItem(settings, country, market.id),
    check('commission', commissions.length > 0, commissions.length > 0 ? 'Configurada' : 'Sin comisión', admin('commissions', market.id)),
    check('market_booking_settings', settings.market !== null, settings.market ? 'Reglas propias de la sede' : 'Usa las del país', admin('bookingSettings', market.id), true),
    check('market_commission', marketLevel.length > 0, marketLevel.length > 0 ? 'Comisión propia' : 'Usa la del país', admin('commissions', market.id), true),
  ];
}

/** The quote's own judgement of the rules and currency (`areaSettingsFrom`). */
function bookingSettingsItem(settings: MarketFacts['settings'], country: Country | null, marketId: string): ReadinessItem {
  const target = admin('bookingSettings', marketId);
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
    deps.bookingSettings.findMany({ marketIds: [], countryIds: [country.id] }),
    deps.commissions.findFor({ zoneIds: [], marketIds: [], countryIds: [country.id] }),
    deps.taxSettings.getByCountry(country.id),
    deps.gatewaySettings.getByCountry(country.id),
    deps.invoicingSettings.getByCountry(country.id),
    deps.documentTypes.getAll(),
  ]);
  const invoiceable = documentTypes.filter((type) => isInvoiceableDocumentType(type.code));
  return summarize([
    check('currency', country.currency !== null && CURRENCY.test(country.currency), country.currency ?? 'Sin moneda', admin('country', country.id)),
    check('country_code', COUNTRY_CODE.test(country.countryCode), country.countryCode, admin('country', country.id)),
    // Departments only hold the municipalities of the goalkeepers' billing data (spec 031).
    check('regions', regions.length > 0, `${regions.length} ${regions.length === 1 ? 'departamento' : 'departamentos'}`, admin('region'), true),
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

/** The market list's summary of each market (`IReadinessSummary`). */
export class ReadinessSummarizer implements IReadinessSummary {
  constructor(private readonly deps: ReadinessDependencies) {}

  async summarize(markets: Market[]): Promise<Map<string, ReadinessSummary>> {
    const results = await readinessForMarkets(this.deps, markets);
    return new Map([...results].map(([id, { ready, missingCount }]) => [id, { ready, missingCount }]));
  }

  check(market: Market): Promise<ReadinessResult> {
    return marketReadiness(this.deps, market);
  }
}
