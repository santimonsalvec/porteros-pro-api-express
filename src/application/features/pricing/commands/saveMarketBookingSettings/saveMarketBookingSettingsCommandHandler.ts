import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { needsAcknowledgement } from '../../../geography/common/warnings.js';
import { asNoticeRules, bufferWarning, checkLevels, EMPTY_SETTINGS, settingsFieldErrors, withMarketRules } from '../../common/bookingRules.js';
import type { PricingGeographyDependencies } from '../../common/pricingGeography.js';
import type { IBookingSettingsAdmin } from '../../common/ports.js';
import { SaveMarketBookingSettingsCommand, type SaveMarketBookingSettingsResult } from './saveMarketBookingSettingsCommand.js';

export class SaveMarketBookingSettingsCommandHandler implements ICommandHandler<SaveMarketBookingSettingsCommand, SaveMarketBookingSettingsResult> {
  constructor(private readonly deps: PricingGeographyDependencies & { bookingSettings: IBookingSettingsAdmin }) {}

  async handle({ marketId, revision, fields, acknowledgeWarnings }: SaveMarketBookingSettingsCommand): Promise<SaveMarketBookingSettingsResult> {
    const market = await this.deps.markets.getById(marketId);
    if (!market) return { outcome: 'not_found' };
    const stored = withMarketRules(fields);
    const fieldErrors = settingsFieldErrors(stored, 'market');
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };

    const countryId = market.countryId;
    const country = countryId ? await this.deps.bookingSettings.getByScope('country', countryId) : null;
    const countryName = countryId ? ((await this.deps.countries.getById(countryId))?.name ?? '') : '';
    const level = { id: market.id, name: market.name, rules: asNoticeRules(stored) };
    const { violations, bufferLevels } = checkLevels({ name: countryName, fields: country?.fields ?? EMPTY_SETTINGS }, [level], market.id);
    if (violations.length > 0) return { outcome: 'notice_violation', violations };
    const warnings = bufferWarning(bufferLevels);
    if (needsAcknowledgement(warnings, acknowledgeWarnings)) return { outcome: 'warnings', warnings };

    const saved = await this.deps.bookingSettings.save('market', marketId, revision, stored);
    return saved === 'saved' ? { outcome: 'saved' } : { outcome: 'stale' };
  }
}
