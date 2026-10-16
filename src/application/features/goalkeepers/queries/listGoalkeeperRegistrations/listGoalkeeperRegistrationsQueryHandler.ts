import { withinAllowed } from '../../../markets/common/marketRestriction.js';
import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { pageOf } from '../../../geography/common/views.js';
import { userName } from '../../../users/common/userViewing.js';
import type { RegistrationSummary } from '../../common/adminViews.js';
import { completeSections, registrationStep } from '../../common/registrationStep.js';
import type { RegistrationsAdminDependencies } from '../../common/registrationsAdminDependencies.js';
import { ListGoalkeeperRegistrationsQuery, type ListGoalkeeperRegistrationsResult } from './listGoalkeeperRegistrationsQuery.js';

const DAY_MS = 86_400_000;

/**
 * Registrations in progress are few (tens), so the step, its filter, the summary and the page are
 * computed here from one read, with the app's own completeness rules (research §12).
 */
export class ListGoalkeeperRegistrationsQueryHandler implements IQueryHandler<ListGoalkeeperRegistrationsQuery, ListGoalkeeperRegistrationsResult> {
  constructor(private readonly deps: RegistrationsAdminDependencies) {}

  async handle({ criteria }: ListGoalkeeperRegistrationsQuery): Promise<ListGoalkeeperRegistrationsResult> {
    const now = this.deps.clock.now().getTime();
    const updatedBefore = criteria.idleDaysMin !== undefined ? new Date(now - criteria.idleDaysMin * DAY_MS) : undefined;
    const ofCountry = !criteria.marketId && criteria.countryId ? (await this.deps.markets.listByCountry(criteria.countryId)).map((market) => market.id) : undefined;
    const marketIds = withinAllowed(ofCountry, criteria.marketIds);
    const all = (await this.deps.registrations.inProgress({ marketId: criteria.marketId, marketIds, updatedBefore })).map((registration) => ({
      registration,
      step: registrationStep(registration),
    }));
    const summary: RegistrationSummary = { identification: 0, physicalData: 0, availability: 0, billing: 0, ready: 0 };
    for (const { step } of all) summary[step] += 1;

    const kept = criteria.step ? all.filter(({ step }) => step === criteria.step) : all;
    const start = (criteria.page - 1) * criteria.pageSize;
    const page = kept.slice(start, start + criteria.pageSize);
    const [users, markets] = await Promise.all([
      this.deps.users.getByIds(page.map(({ registration }) => registration.userId)),
      this.deps.markets.getByIds([...new Set(page.flatMap(({ registration }) => (registration.availability.marketId ? [registration.availability.marketId] : [])))]),
    ]);
    const items = page.map(({ registration, step }) => {
      const user = users.find((candidate) => candidate.id === registration.userId);
      return {
        userId: registration.userId,
        name: user ? userName(user) : null,
        email: user?.email ?? null,
        step,
        completeSections: completeSections(registration),
        marketName: markets.find((market) => market.id === registration.availability.marketId)?.name ?? null,
        createdAt: registration.createdAt.toISOString(),
        updatedAt: registration.updatedAt.toISOString(),
        idleDays: Math.floor((now - registration.updatedAt.getTime()) / DAY_MS),
      };
    });
    return { ...pageOf(items, criteria.page, criteria.pageSize, kept.length), summary };
  }
}
