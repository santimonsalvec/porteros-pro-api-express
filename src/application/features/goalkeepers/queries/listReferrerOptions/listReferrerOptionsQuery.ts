import { IQuery } from '../../../../common/mediator/types.js';

export interface ReferrerOption {
  userId: string;
  name: string | null;
  city: { id: string; name: string } | null;
}

/** Who can refer a goalkeeper: validated or verified goalkeepers, not blocked, by name (contracts C9). */
export class ListReferrerOptionsQuery extends IQuery<{ items: ReferrerOption[] }> {
  constructor(
    public readonly q: string,
    /** The goalkeeper being verified, who cannot refer themself. */
    public readonly exclude: string,
  ) {
    super();
  }
}
