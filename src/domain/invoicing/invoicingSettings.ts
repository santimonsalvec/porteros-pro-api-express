import { Entity } from '../common/entity.js';
import { InvalidConfigurationError } from '../pricing/invalidConfigurationError.js';

/** The invoicing providers this system can talk to (feature 023). A new country's provider is added here. */
export const SUPPORTED_INVOICING_PROVIDERS = ['siigo'] as const;
export type InvoicingProviderName = (typeof SUPPORTED_INVOICING_PROVIDERS)[number];

/** Siigo's identifiers in the country's Siigo account (research.md §1, §7). No secrets. */
export interface SiigoConfig {
  partnerId: string;
  invoiceDocumentId: number;
  creditNoteDocumentId: number;
  sellerId: number;
  commissionProductCode: string;
  penaltyProductCode: string;
  vatTaxId: number;
  paymentMethodId: number;
}

const SIIGO_INTEGER_FIELDS = ['invoiceDocumentId', 'creditNoteDocumentId', 'sellerId', 'vatTaxId', 'paymentMethodId'] as const;
const SIIGO_STRING_FIELDS = ['partnerId', 'commissionProductCode', 'penaltyProductCode'] as const;

export interface InvoicingSettingsProps {
  countryId: string;
  provider: InvoicingProviderName;
  config: Record<string, unknown>;
  updatedAt: Date;
  updatedBy: string;
}

function isProvider(value: string): value is InvoicingProviderName {
  return (SUPPORTED_INVOICING_PROVIDERS as readonly string[]).includes(value);
}

/** Every rule a provider's configuration must satisfy; each problem names its field. Empty = valid. */
export function invoicingSettingsProblems(provider: string, config: Record<string, unknown>): string[] {
  if (!isProvider(provider)) return [`provider: '${provider}' is not supported`];
  const problems: string[] = [];
  const known = new Set<string>([...SIIGO_INTEGER_FIELDS, ...SIIGO_STRING_FIELDS]);
  for (const key of Object.keys(config)) {
    // Unknown keys are refused, so nothing (a credential included) can be stored by mistake.
    if (!known.has(key)) problems.push(`config.${key}: is not a ${provider} setting`);
  }
  for (const field of SIIGO_INTEGER_FIELDS) {
    const value = config[field];
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) problems.push(`config.${field}: must be a positive integer`);
  }
  for (const field of SIIGO_STRING_FIELDS) {
    const value = config[field];
    if (typeof value !== 'string' || value.trim() === '') problems.push(`config.${field}: is required`);
  }
  return problems;
}

/** Which invoicing provider a country uses, with its non-secret configuration (feature 023). */
export class InvoicingSettings extends Entity<string> {
  readonly provider: InvoicingProviderName;
  readonly config: Readonly<Record<string, unknown>>;
  readonly updatedAt: Date;
  readonly updatedBy: string;

  private constructor(props: InvoicingSettingsProps) {
    super(props.countryId);
    this.provider = props.provider;
    this.config = { ...props.config };
    this.updatedAt = new Date(props.updatedAt);
    this.updatedBy = props.updatedBy;
  }

  get countryId(): string {
    return this.id;
  }

  static create(props: InvoicingSettingsProps): { ok: true; settings: InvoicingSettings } | { ok: false; problems: string[] } {
    const problems = invoicingSettingsProblems(props.provider, props.config);
    return problems.length > 0 ? { ok: false, problems } : { ok: true, settings: new InvoicingSettings(props) };
  }

  static rehydrate(props: InvoicingSettingsProps): InvoicingSettings {
    const problems = invoicingSettingsProblems(props.provider, props.config);
    if (problems.length > 0) throw new InvalidConfigurationError(`invoicingSettings document ${props.countryId}: ${problems.join('; ')}`);
    return new InvoicingSettings(props);
  }
}
