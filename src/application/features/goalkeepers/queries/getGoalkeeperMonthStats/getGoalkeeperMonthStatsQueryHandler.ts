import type { IClock } from '../../../../common/clock.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import {
  addMonths,
  daysInMonth,
  localDayStart,
  type CalendarMonth,
} from '../../../goalkeeperRequests/common/monthRange.js';
import type { IBookingRepository } from '../../../goalkeeperRequests/common/ports.js';
import { isValidTimeZone, toLocalParts } from '../../../goalkeeperRequests/common/zonedTime.js';
import {
  resolveGoalkeeperWalletContext,
  type GoalkeeperWalletContextDependencies,
} from '../../../wallet/common/goalkeeperWalletContext.js';
import {
  GetGoalkeeperMonthStatsQuery,
  type GetGoalkeeperMonthStatsResult,
} from './getGoalkeeperMonthStatsQuery.js';

export interface GetGoalkeeperMonthStatsDependencies {
  /** Who the goalkeeper is and their currency, resolved exactly as for the wallet. */
  context: GoalkeeperWalletContextDependencies;
  bookingRepository: IBookingRepository;
  clock: IClock;
}

/**
 * The goalkeeper's month so far (026 research §1–§4): what the played matches earned, against the
 * previous month through the same day. Months are cut in the time zone of the goalkeeper's city,
 * and "now" is read once so both periods agree on what today is. Nothing is stored.
 */
export class GetGoalkeeperMonthStatsQueryHandler implements IQueryHandler<
  GetGoalkeeperMonthStatsQuery,
  GetGoalkeeperMonthStatsResult
> {
  constructor(private readonly deps: GetGoalkeeperMonthStatsDependencies) {}

  async handle(query: GetGoalkeeperMonthStatsQuery): Promise<GetGoalkeeperMonthStatsResult> {
    const { goalkeeperId } = query;
    const context = await resolveGoalkeeperWalletContext(this.deps.context, goalkeeperId);
    if (context.kind === 'not_a_goalkeeper') return { outcome: 'not_a_goalkeeper' };
    if (context.kind === 'wallet_not_configured')
      return { outcome: 'wallet_not_configured', cityId: context.cityId };

    const city = await this.deps.context.cityRepository.getById(context.profile.cityId);
    const timeZone = city?.timeZone;
    if (!timeZone || !isValidTimeZone(timeZone))
      return { outcome: 'time_zone_not_configured', cityId: context.profile.cityId };

    const today = toLocalParts(this.deps.clock.now().getTime(), timeZone);
    const month: CalendarMonth = { year: today.year, month: today.month };
    const monthStart = localDayStart(month, 1, timeZone);
    const previousMonth = addMonths(month, -1);
    const throughDay = Math.min(today.day, daysInMonth(previousMonth));
    // Whole days: the previous period ends where the day after `throughDay` starts.
    const previousEnd =
      throughDay === daysInMonth(previousMonth)
        ? monthStart
        : localDayStart(previousMonth, throughDay + 1, timeZone);

    const bookings = this.deps.bookingRepository;
    const [current, previous, toPlay] = await Promise.all([
      bookings.summarizeCompletedForGoalkeeper(
        goalkeeperId,
        monthStart,
        localDayStart(addMonths(month, 1), 1, timeZone),
      ),
      bookings.summarizeCompletedForGoalkeeper(
        goalkeeperId,
        localDayStart(previousMonth, 1, timeZone),
        previousEnd,
      ),
      bookings.countAssignedForGoalkeeper(goalkeeperId),
    ]);

    return {
      outcome: 'success',
      stats: {
        month,
        currency: context.currency,
        earned: current.earned,
        playedCount: current.played,
        averagePerMatch: current.played > 0 ? roundHalfAway(current.earned / current.played) : null,
        toPlay,
        previous: { month: previousMonth, throughDay, earned: previous.earned },
        changePercent:
          previous.earned > 0
            ? roundHalfAway(((current.earned - previous.earned) / previous.earned) * 100)
            : null,
      },
    };
  }
}

/** Rounds halves away from zero, so a drop of 37.5 % reads as −38 just as a rise reads as +38. */
function roundHalfAway(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}
