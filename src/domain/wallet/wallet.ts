export interface WalletProps {
  goalkeeperId: string;
  currency: string;
  balance: number;
  lastSequence: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A goalkeeper's prepaid credit for commissions and penalties — never withdrawable. `balance` is
 * materialized but always equal to the sum of the wallet's movements, because both are written in
 * the same transaction; `lastSequence` is the sequence of its latest movement (= how many it has).
 */
export class Wallet {
  readonly goalkeeperId: string;
  readonly currency: string;
  readonly balance: number;
  readonly lastSequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: WalletProps) {
    this.goalkeeperId = props.goalkeeperId;
    this.currency = props.currency;
    this.balance = props.balance;
    this.lastSequence = props.lastSequence;
    this.createdAt = new Date(props.createdAt);
    this.updatedAt = new Date(props.updatedAt);
  }

  static rehydrate(props: WalletProps): Wallet {
    return new Wallet(props);
  }

  /** How a wallet looks before its first movement (it is created lazily by that movement). */
  static empty(goalkeeperId: string, currency: string, now: Date): Wallet {
    return new Wallet({ goalkeeperId, currency, balance: 0, lastSequence: 0, createdAt: now, updatedAt: now });
  }
}
