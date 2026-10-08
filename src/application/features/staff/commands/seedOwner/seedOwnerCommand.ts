import { ICommand } from '../../../../common/mediator/types.js';

export type SeedOwnerResult =
  | { outcome: 'created' | 'unchanged' | 'promoted'; staffId: string }
  | { outcome: 'invalid_email' };

/** The first owner of an environment, from `scripts/seed-owner.ts` — never from the admin web. */
export class SeedOwnerCommand extends ICommand<SeedOwnerResult> {
  constructor(readonly email: string) {
    super();
  }
}
