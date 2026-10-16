import { ICommand } from '../../../../common/mediator/types.js';
import type { MarketChangeRefusal } from '../../../../../domain/goalkeepers/marketChange.js';
import type { GoalkeeperRegistrationResponse } from '../../common/goalkeeperRegistrationResponse.js';

export type ChangeGoalkeeperMarketResult =
  | { outcome: 'changed'; goalkeeper: GoalkeeperRegistrationResponse }
  | { outcome: 'invalid_zones'; invalidZoneIds: string[] }
  | { outcome: 'not_a_goalkeeper' }
  | { outcome: 'not_active' }
  | RefusedMarketChange;

/** Each refusal of data-model §7, its `kind` as the outcome. */
export type RefusedMarketChange = MarketChangeRefusal extends infer Refusal
  ? Refusal extends { kind: infer Kind }
    ? { outcome: Kind } & Omit<Refusal, 'kind'>
    : never
  : never;

/**
 * Moves an active goalkeeper to another market with new zones (spec 031, FR-025–FR-028). Only the
 * goalkeeper does it, from the app: the team has no such action.
 */
export class ChangeGoalkeeperMarketCommand extends ICommand<ChangeGoalkeeperMarketResult> {
  constructor(
    public readonly userId: string,
    public readonly marketId: string,
    public readonly zoneIds: string[],
  ) {
    super();
  }
}
