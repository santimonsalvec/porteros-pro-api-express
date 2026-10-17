import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import type { IStaffMemberRepository } from '../../common/ports.js';
import { SetMyLanguageCommand, type SetMyLanguageResult } from './setMyLanguageCommand.js';

export interface SetMyLanguageDependencies {
  members: Pick<IStaffMemberRepository, 'getById'>;
  users: Pick<IUserRepository, 'getById' | 'update'>;
}

/** Writes `users.preferredLanguage` of the member's linked user; the same value again is a no-op that still answers `saved`. */
export class SetMyLanguageCommandHandler implements ICommandHandler<SetMyLanguageCommand, SetMyLanguageResult> {
  constructor(private readonly deps: SetMyLanguageDependencies) {}

  async handle(command: SetMyLanguageCommand): Promise<SetMyLanguageResult> {
    const member = await this.deps.members.getById(command.staffId);
    const user = member?.userId ? await this.deps.users.getById(member.userId) : null;
    if (!user) return { outcome: 'not_found' };
    if (user.preferredLanguage !== command.language) {
      user.preferredLanguage = command.language;
      await this.deps.users.update(user);
    }
    return { outcome: 'saved' };
  }
}
