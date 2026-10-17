import type { ICommandHandler } from '../../../../common/mediator/types.js';
import type { IUserRepository } from '../../../auth/common/ports.js';
import { SetLanguageCommand, type SetLanguageResult } from './setLanguageCommand.js';

/** Writes `users.preferredLanguage`; saving the same value again is a no-op that still answers `saved`. */
export class SetLanguageCommandHandler implements ICommandHandler<SetLanguageCommand, SetLanguageResult> {
  constructor(private readonly users: Pick<IUserRepository, 'getById' | 'update'>) {}

  async handle(command: SetLanguageCommand): Promise<SetLanguageResult> {
    const user = await this.users.getById(command.userId);
    if (!user) return { outcome: 'user_not_found' };
    if (user.preferredLanguage !== command.language) {
      user.preferredLanguage = command.language;
      await this.users.update(user);
    }
    return { outcome: 'saved' };
  }
}
