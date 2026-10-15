export interface OperatingBalanceProps {
  goalkeeperId: string;
  currency: string;
  balance: number;
  lastSequence: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A goalkeeper's prepaid credit for commissions and penalties — never withdrawable. `balance` is
 * materialized but always equal to the sum of the operating balance's movements, because both are written in
 * the same transaction; `lastSequence` is the sequence of its latest movement (= how many it has).
 */
export class OperatingBalance {
  readonly goalkeeperId: string;
  readonly currency: string;
  readonly balance: number;
  readonly lastSequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: OperatingBalanceProps) {
    this.goalkeeperId = props.goalkeeperId;
    this.currency = props.currency;
    this.balance = props.balance;
    this.lastSequence = props.lastSequence;
    this.createdAt = new Date(props.createdAt);
    this.updatedAt = new Date(props.updatedAt);
  }

  static rehydrate(props: OperatingBalanceProps): OperatingBalance {
    return new OperatingBalance(props);
  }

  /** How a operating balance looks before its first movement (it is created lazily by that movement). */
  static empty(goalkeeperId: string, currency: string, now: Date): OperatingBalance {
    return new OperatingBalance({ goalkeeperId, currency, balance: 0, lastSequence: 0, createdAt: now, updatedAt: now });
  }
}
