import type { IClock } from '../../../../common/clock.js';
import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IIdGenerator } from '../../../auth/common/ports.js';
import type { ICountryLookup } from '../../../goalkeeperRequests/common/ports.js';
import { Market } from '../../../../../domain/markets/market.js';
import { marketFieldErrors } from '../../common/marketFields.js';
import type { IAdminMarketRepository } from '../../common/ports.js';
import { CreateMarketCommand, type CreateMarketResult } from './createMarketCommand.js';

export interface CreateMarketDependencies {
  markets: Pick<IAdminMarketRepository, 'create'>;
  countries: ICountryLookup;
  ids: IIdGenerator;
  clock: IClock;
}

export class CreateMarketCommandHandler implements ICommandHandler<CreateMarketCommand, CreateMarketResult> {
  constructor(private readonly deps: CreateMarketDependencies) {}

  async handle({ fields, createdBy }: CreateMarketCommand): Promise<CreateMarketResult> {
    const fieldErrors = marketFieldErrors(fields);
    if (fieldErrors) return { outcome: 'invalid', fieldErrors };
    const country = await this.deps.countries.getById(fields.countryId);
    if (!country) return { outcome: 'country_not_found' };
    if (!country.currency) return { outcome: 'country_without_currency' };

    const market = Market.create({ id: this.deps.ids.newId(), ...fields, createdBy }, this.deps.clock.now());
    const created = await this.deps.markets.create(market);
    return created === 'created' ? { outcome: 'created', marketId: market.id } : { outcome: 'market_name_taken' };
  }
}
