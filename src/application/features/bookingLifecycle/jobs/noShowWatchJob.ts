import { goalkeeperNoShow } from '../../../../domain/events/bookingEvents.js';
import type { GoalkeeperRequest } from '../../../../domain/bookings/goalkeeperRequest.js';
import type { IClock } from '../../../common/clock.js';
import type { IIdGenerator } from '../../auth/common/ports.js';
import type { IEventRelay, IScheduledJob } from '../../events/common/ports.js';
import type { IBookingRepository, IGoalkeeperRequestRepository } from '../../goalkeeperRequests/common/ports.js';
import { resolvePenaltyConfig, type PenaltyConfigDependencies } from '../common/penaltyConfig.js';
import type { IBookingLifecycleStore } from '../common/ports.js';

export interface NoShowWatchDependencies extends PenaltyConfigDependencies {
  bookingRepository: IBookingRepository;
  requestRepository: IGoalkeeperRequestRepository;
  store: IBookingLifecycleStore;
  relay: IEventRelay;
  idGenerator: IIdGenerator;
  clock: IClock;
  /** A fresh grace resolver per run (it caches per city). */
  graceResolver: () => (request: GoalkeeperRequest) => Promise<number>;
  cap?: number;
}

/**
 * Settles attendance (feature 021, Story 3): at end + grace, a completed booking without a
 * check-in or the client's "yes" is a no-show — the penalty policy applies it as a late withdrawal
 * (018). The store re-checks everything in its transaction, so a late rating can't be overwritten.
 */
export class NoShowWatchJob implements IScheduledJob {
  readonly name = 'no-show-watch';
  readonly leaseSeconds = 55;

  constructor(private readonly deps: NoShowWatchDependencies) {}

  async run(now: Date): Promise<string> {
    const cap = this.deps.cap ?? 500;
    const due = await this.deps.bookingRepository.findDueForAttendance(now, cap);
    if (due.length === cap) this.deps.logger.warn({ outcome: 'lifecycle_cap_reached', job: this.name, cap }, 'No-show watch read its maximum of bookings');
    const grace = this.deps.graceResolver();
    const requests = new Map((await this.deps.requestRepository.findByIds([...new Set(due.map((b) => b.requestId))])).map((r) => [r.id, r]));

    const counts = { noShows: 0, attended: 0, failed: 0 };
    for (const booking of due) {
      const request = requests.get(booking.requestId);
      if (!request) continue;
      try {
        if (now.getTime() < booking.endsAt.getTime() + (await grace(request)) * 60_000) continue;
        const config = await resolvePenaltyConfig(this.deps, booking.goalkeeperId!);
        const result = await this.deps.store.settleAttendance({
          bookingId: booking.id,
          now,
          config,
          newId: () => this.deps.idGenerator.newId(),
          buildEvents: (noShow) => [goalkeeperNoShow(this.deps.idGenerator.newId(), noShow.booking, noShow.incident, noShow.suspendedUntil, now)],
        });
        if (result.kind === 'no_show') {
          counts.noShows += 1;
          await this.deps.relay.relay(result.events);
        } else if (result.kind === 'attended') counts.attended += 1;
      } catch (err) {
        counts.failed += 1;
        this.deps.logger.warn({ outcome: 'lifecycle_item_failed', job: this.name, bookingId: booking.id, err }, 'No-show watch failed; retried next sweep');
      }
    }
    if (counts.noShows + counts.attended + counts.failed > 0) this.deps.logger.info({ outcome: 'attendance_settled', ...counts }, 'Attendance settled');
    return `${counts.noShows} no-shows, ${counts.attended} attended, ${counts.failed} failed`;
  }
}
