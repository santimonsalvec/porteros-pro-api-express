import { Entity } from '../common/entity.js';
import { InvalidConfigurationError } from '../pricing/invalidConfigurationError.js';
import { BPS } from './vat.js';

export interface TaxSettingProps {
  countryId: string;
  /** VAT charged on top of commissions and penalties, in basis points (1900 = 19 %). */
  vatRateBps: number;
  updatedAt: Date;
  updatedBy: string;
}

function problemsOf(props: TaxSettingProps): string[] {
  return Number.isInteger(props.vatRateBps) && props.vatRateBps >= 0 && props.vatRateBps <= BPS
    ? []
    : ['vatRateBps: must be an integer between 0 and 10000'];
}

/** A country's VAT rate, set by administrators (feature 023). Applies to charges made afterwards. */
export class TaxSetting extends Entity<string> {
  readonly vatRateBps: number;
  readonly updatedAt: Date;
  readonly updatedBy: string;

  private constructor(props: TaxSettingProps) {
    super(props.countryId);
    this.vatRateBps = props.vatRateBps;
    this.updatedAt = new Date(props.updatedAt);
    this.updatedBy = props.updatedBy;
  }

  get countryId(): string {
    return this.id;
  }

  static create(props: TaxSettingProps): { ok: true; setting: TaxSetting } | { ok: false; problems: string[] } {
    const problems = problemsOf(props);
    return problems.length > 0 ? { ok: false, problems } : { ok: true, setting: new TaxSetting(props) };
  }

  static rehydrate(props: TaxSettingProps): TaxSetting {
    const problems = problemsOf(props);
    if (problems.length > 0) throw new InvalidConfigurationError(`taxSettings document ${props.countryId}: ${problems.join('; ')}`);
    return new TaxSetting(props);
  }
}
