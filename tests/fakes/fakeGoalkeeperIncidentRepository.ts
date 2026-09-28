import type { IGoalkeeperIncidentRepository } from '../../src/application/features/bookingLifecycle/common/ports.js';
import type { GoalkeeperIncident } from '../../src/domain/goalkeepers/goalkeeperIncident.js';
import type { FakeBookingLifecycleStore } from './fakeBookingLifecycleStore.js';

/** Reads the incidents the fake lifecycle store writes, newest first. */
export class FakeGoalkeeperIncidentRepository implements IGoalkeeperIncidentRepository {
  constructor(private readonly store: FakeBookingLifecycleStore) {}

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<GoalkeeperIncident[]> {
    return this.ofGoalkeeper(goalkeeperId).slice(skip, skip + limit);
  }

  async countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.ofGoalkeeper(goalkeeperId).length;
  }

  private ofGoalkeeper(goalkeeperId: string): GoalkeeperIncident[] {
    return this.store
      .incidents()
      .filter((incident) => incident.goalkeeperId === goalkeeperId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || (a.id < b.id ? 1 : -1));
  }
}
