import type { IQueryHandler } from '../../../../common/mediator/types.js';
import { contactVersion } from '../../../../../domain/users/contactVersion.js';
import type { UsersQueryDependencies } from '../../common/usersQueryDependencies.js';
import { blockView, countryCodesByDialCode, userName } from '../../common/userViewing.js';
import { GetUserQuery, type GetUserResult } from './getUserQuery.js';

export class GetUserQueryHandler implements IQueryHandler<GetUserQuery, GetUserResult> {
  constructor(private readonly deps: UsersQueryDependencies) {}

  async handle({ userId }: GetUserQuery): Promise<GetUserResult> {
    const user = await this.deps.users.getById(userId);
    if (!user) return { outcome: 'not_found' };
    const [profile, block, terms, devices, requestCount, countries] = await Promise.all([
      this.deps.profiles.getByUserId(userId),
      this.deps.blocks.findByUserId(userId),
      this.deps.reader.terms(userId),
      this.deps.reader.devices(userId),
      this.deps.reader.requestCount(userId),
      this.deps.countries.getAll(),
    ]);
    const codes = countryCodesByDialCode(countries);
    const closure = (await this.deps.closures?.findLatestByUserId(userId)) ?? null;
    const closing = closure?.isOpen === true;
    return {
      outcome: 'ok',
      user: {
        id: user.id,
        name: userName(user),
        email: user.email,
        countryCode: user.countryCallingCode ? (codes.get(user.countryCallingCode) ?? null) : null,
        createdAt: user.createdAt.toISOString(),
        isProfileComplete: user.isProfileComplete,
        isGoalkeeper: profile !== null,
        blocked: block?.blocked ?? false,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        countryCallingCode: user.countryCallingCode,
        version: contactVersion(user),
        block: await blockView(this.deps.staff, block),
        terms: terms.map((term) => ({ version: term.version, acceptedAt: term.acceptedAt.toISOString() })),
        devices: devices.map((device) => ({ platform: device.platform, lastSeenAt: device.lastSeenAt.toISOString() })),
        requestCount,
        accountState: closing ? 'closing' : closure?.status === 'closed' ? 'closed' : 'active',
        openClosureId: closing ? closure.id : null,
      },
    };
  }
}
