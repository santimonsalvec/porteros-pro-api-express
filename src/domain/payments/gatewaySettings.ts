import { Entity } from '../common/entity.js';
import { InvalidConfigurationError } from '../pricing/invalidConfigurationError.js';

/** The payment gateways this system can talk to (feature 022). */
export const SUPPORTED_GATEWAYS = ['wompi'] as const;
export type GatewayName = (typeof SUPPORTED_GATEWAYS)[number];

export type GatewayEnvironment = 'sandbox' | 'production';

/** What a top-up costs at the gateway: a percentage, a fixed part, and VAT on both (research.md §9). */
export interface GatewayCosts {
  /** Basis points of the amount (265 = 2.65 %). */
  percentBps: number;
  /** Whole currency units per transaction. */
  fixed: number;
  /** VAT on the fee, in basis points (1900 = 19 %). */
  vatBps: number;
}

/** Non-secret gateway configuration. The secrets live in Secret Manager, never here. */
export interface GatewayPublicConfig {
  publicKey: string;
  environment: GatewayEnvironment;
}

export interface TopUpOption {
  amount: number;
  cost: number;
  net: number;
}

export interface PaymentGatewaySettingsProps {
  countryId: string;
  gateway: GatewayName;
  publicConfig: GatewayPublicConfig;
  currency: string;
  costs: GatewayCosts;
  amounts: number[];
  updatedAt: Date;
  updatedBy: string;
}

export const MAX_TOP_UP_AMOUNTS = 10;
const BPS_MAX = 10_000;
const PUBLIC_KEY_PREFIX: Record<GatewayEnvironment, string> = { sandbox: 'pub_test_', production: 'pub_prod_' };

/**
 * The gateway's fee for one amount, in whole units, rounded up so the platform never absorbs a
 * fraction: `raw = amount × percentBps + fixed × 10⁴` (units × 10⁴), `cost = ⌈raw × (10⁴ + vatBps) / 10⁸⌉`.
 * Integer arithmetic only, so no floating-point drift.
 */
export function costFor(amount: number, costs: GatewayCosts): number {
  const raw = BigInt(amount) * BigInt(costs.percentBps) + BigInt(costs.fixed) * 10_000n;
  const scaled = raw * BigInt(BPS_MAX + costs.vatBps);
  const divisor = 100_000_000n;
  return Number((scaled + divisor - 1n) / divisor);
}

function isGateway(value: string): value is GatewayName {
  return (SUPPORTED_GATEWAYS as readonly string[]).includes(value);
}

function isBps(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= BPS_MAX;
}

/** Every rule a country's settings must satisfy; each problem names its field. Empty = valid. */
export function settingsProblems(props: Omit<PaymentGatewaySettingsProps, 'updatedAt' | 'updatedBy'>): string[] {
  const problems: string[] = [];
  if (!isGateway(props.gateway)) problems.push(`gateway: '${String(props.gateway)}' is not supported`);
  const environment = props.publicConfig?.environment;
  if (environment !== 'sandbox' && environment !== 'production') {
    problems.push('publicConfig.environment: must be sandbox or production');
  } else if (typeof props.publicConfig.publicKey !== 'string' || !props.publicConfig.publicKey.startsWith(PUBLIC_KEY_PREFIX[environment])) {
    problems.push(`publicConfig.publicKey: must start with ${PUBLIC_KEY_PREFIX[environment]} in ${environment}`);
  }
  if (!/^[A-Z]{3}$/.test(props.currency)) problems.push('currency: must be a 3-letter ISO 4217 code');
  const costs = props.costs;
  const costsValid = Boolean(costs) && isBps(costs.percentBps) && isBps(costs.vatBps) && Number.isInteger(costs.fixed) && costs.fixed >= 0;
  if (!costsValid) problems.push('costs: percentBps and vatBps must be integers 0–10000, fixed an integer ≥ 0');
  const amounts = props.amounts;
  if (!Array.isArray(amounts) || amounts.length === 0 || amounts.length > MAX_TOP_UP_AMOUNTS) {
    problems.push(`amounts: between 1 and ${MAX_TOP_UP_AMOUNTS} values`);
  } else if (!amounts.every((amount) => Number.isInteger(amount) && amount > 0)) {
    problems.push('amounts: every amount must be a positive integer');
  } else if (new Set(amounts).size !== amounts.length) {
    problems.push('amounts: values must be distinct');
  } else if (costsValid) {
    const tooSmall = amounts.filter((amount) => amount - costFor(amount, costs) < 1);
    if (tooSmall.length > 0) problems.push(`amounts: ${tooSmall.join(', ')} would leave nothing after the gateway cost`);
  }
  return problems;
}

/**
 * Which gateway a country uses for top-ups, with its public configuration, costs and the amounts
 * offered (feature 022). One per country. Amounts are kept sorted ascending.
 */
export class PaymentGatewaySettings extends Entity<string> {
  readonly gateway: GatewayName;
  readonly publicConfig: GatewayPublicConfig;
  readonly currency: string;
  readonly costs: GatewayCosts;
  readonly amounts: number[];
  readonly updatedAt: Date;
  readonly updatedBy: string;

  private constructor(props: PaymentGatewaySettingsProps) {
    super(props.countryId);
    this.gateway = props.gateway;
    this.publicConfig = { publicKey: props.publicConfig.publicKey, environment: props.publicConfig.environment };
    this.currency = props.currency;
    this.costs = { percentBps: props.costs.percentBps, fixed: props.costs.fixed, vatBps: props.costs.vatBps };
    this.amounts = [...props.amounts].sort((a, b) => a - b);
    this.updatedAt = new Date(props.updatedAt);
    this.updatedBy = props.updatedBy;
  }

  get countryId(): string {
    return this.id;
  }

  /** An administrator's change: invalid input is answered with its problems, never thrown. */
  static create(props: PaymentGatewaySettingsProps): { ok: true; settings: PaymentGatewaySettings } | { ok: false; problems: string[] } {
    const problems = settingsProblems(props);
    return problems.length > 0 ? { ok: false, problems } : { ok: true, settings: new PaymentGatewaySettings(props) };
  }

  /** A stored document: malformed data is a configuration error, raised loudly. */
  static rehydrate(props: PaymentGatewaySettingsProps): PaymentGatewaySettings {
    const problems = settingsProblems(props);
    if (problems.length > 0) {
      throw new InvalidConfigurationError(`paymentGatewaySettings document ${props.countryId}: ${problems.join('; ')}`);
    }
    return new PaymentGatewaySettings(props);
  }

  costFor(amount: number): number {
    return costFor(amount, this.costs);
  }

  /** What the goalkeeper is offered: each amount with its cost and what reaches the wallet. */
  options(): TopUpOption[] {
    return this.amounts.map((amount) => {
      const cost = this.costFor(amount);
      return { amount, cost, net: amount - cost };
    });
  }
}
