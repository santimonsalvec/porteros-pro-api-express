import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import { marketFieldErrors } from '../../common/marketFields.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { UpdateMarketCommand, type UpdateMarketResult } from './updateMarketCommand.js';

export interface UpdateMarketDependencies {
  markets: Pick<IAdminMarketRepository, 'getById' | 'update'>;
  clock: IClock;
}

export class UpdateMarketCommandHandler implements ICommandHandler<UpdateMarketCommand, UpdateMarketResult> {
  constructor(private readonly deps: UpdateMarketDependencies) {}

  async handle({ marketId, revision, edits }: UpdateMarketCommand): Promise<UpdateMarketResult> {
    const stored = await this.deps.markets.getById(marketId);
    if (!stored) return { outcome: 'not_found' };
    if (edits.countryId !== undefined && edits.countryId !== stored.countryId) return { outcome: 'country_immutable' };

    const edited = stored.withEdits({ name: edits.name, timeZone: edits.timeZone }, this.deps.clock.now());
    const fieldErrors = marketFieldErrors(edited);
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };

    const result = await this.deps.markets.update(edited, revision);
    if (result === 'stale') return { outcome: 'stale' };
    return result === 'saved' ? { outcome: 'saved' } : { outcome: 'market_name_taken' };
  }
}
