import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { billingWithPlaceNames } from '../../common/billingPlaces.js';
import { userName } from '../../../users/common/userViewing.js';
import { computeGoalkeeperSections } from '../../common/goalkeeperSections.js';
import { fieldStatus, registrationStep } from '../../common/registrationStep.js';
import type { RegistrationsAdminDependencies } from '../../common/registrationsAdminDependencies.js';
import { GetGoalkeeperRegistrationAdminQuery, type GetGoalkeeperRegistrationAdminResult } from './getGoalkeeperRegistrationAdminQuery.js';

export class GetGoalkeeperRegistrationAdminQueryHandler implements IQueryHandler<GetGoalkeeperRegistrationAdminQuery, GetGoalkeeperRegistrationAdminResult> {
  constructor(private readonly deps: RegistrationsAdminDependencies) {}

  async handle({ userId }: GetGoalkeeperRegistrationAdminQuery): Promise<GetGoalkeeperRegistrationAdminResult> {
    const registration = await this.deps.registrations.getByUserId(userId);
    if (!registration || registration.status !== 'in_progress') return { outcome: 'not_found' };
    const { availability, physicalData } = registration;
    const [user, markets, zones, billing] = await Promise.all([
      this.deps.users.getById(userId),
      availability.marketId ? this.deps.markets.getByIds([availability.marketId]) : Promise.resolve([]),
      this.deps.zones.getManyByIds(availability.zoneIds),
      billingWithPlaceNames(registration.billing, this.deps.places),
    ]);
    const sections = computeGoalkeeperSections(registration);
    const fields = fieldStatus(registration);
    const market = markets[0];
    return {
      outcome: 'ok',
      registration: {
        userId,
        name: user ? userName(user) : null,
        step: registrationStep(registration),
        sections: {
          identification: { complete: sections.identification.complete, fields: fields.identification },
          physicalData: { complete: sections.physicalData.complete, fields: fields.physicalData, values: { heightCm: physicalData.heightCm, weightKg: physicalData.weightKg } },
          availability: {
            complete: sections.availability.complete,
            market: market ? { id: market.id, name: market.name } : null,
            zones: availability.zoneIds.map((id) => ({ id, name: zones.find((zone) => zone.id === id)?.name ?? id })),
          },
          billing: { complete: sections.billing.complete, ...billing },
        },
        createdAt: registration.createdAt.toISOString(),
        updatedAt: registration.updatedAt.toISOString(),
      },
    };
  }
}
