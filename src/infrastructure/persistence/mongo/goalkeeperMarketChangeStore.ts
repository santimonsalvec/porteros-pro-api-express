import type { ClientSession, Db, Document } from 'mongodb';
import type {
  IGoalkeeperMarketChangeStore,
  IGoalkeeperProfileRepository,
  MarketChangeStoreResult,
} from '../../../application/features/goalkeepers/common/ports.js';
import { OPEN_CLOSURE_STATUSES } from '../../../domain/accountClosures/accountClosure.js';
import type { MarketChangeRefusal } from '../../../domain/goalkeepers/marketChange.js';
import { ACCOUNT_CLOSURES_COLLECTION } from './accountClosureRepository.js';
import { BOOKINGS_COLLECTION } from './bookingRepository.js';
import { DEPOSITS_COLLECTION } from './depositRepository.js';
import { OPERATING_BALANCES_COLLECTION } from './operatingBalanceRepository.js';

const PROFILES_COLLECTION = 'goalkeeperProfiles';

/** Ends the transaction with a refusal and no writes; `withTransaction` does not retry it. */
class MarketChangeAbort extends Error {
  constructor(readonly refusal: MarketChangeRefusal) {
    super(`market change refused: ${refusal.kind}`);
  }
}

/**
 * The market change as ONE transaction (spec 031, research §9). It reads the goalkeeper's held
 * bookings, operating balance, pending deposit and open closure, asks `decide`, then writes the
 * profile and, across countries, the balance's currency. The balance document is written only
 * then, so a deposit approved meanwhile (which writes it too) makes one of the two retry and see
 * the other.
 */
export class MongoGoalkeeperMarketChangeStore implements IGoalkeeperMarketChangeStore {
  constructor(
    private readonly startSession: () => ClientSession,
    private readonly db: Db,
    private readonly profiles: Pick<IGoalkeeperProfileRepository, 'getByUserId'>,
  ) {}

  async changeMarket(args: Parameters<IGoalkeeperMarketChangeStore['changeMarket']>[0]): Promise<MarketChangeStoreResult> {
    const { userId } = args;
    const session = this.startSession();
    try {
      const changed = await session.withTransaction(
        async () => {
          const profile = await this.db.collection(PROFILES_COLLECTION).findOne({ userId }, { projection: { _id: 1 }, session });
          if (!profile) return false;
          const [held, balance, deposit, closure] = await Promise.all([
            this.db
              .collection(BOOKINGS_COLLECTION)
              .find({ goalkeeperId: userId, status: 'assigned' } as Document, { projection: { _id: 1 }, session })
              .toArray(),
            this.db.collection(OPERATING_BALANCES_COLLECTION).findOne({ _id: userId } as Document, { session }),
            this.db.collection(DEPOSITS_COLLECTION).findOne({ goalkeeperId: userId, status: 'pending' }, { projection: { _id: 1 }, session }),
            this.db
              .collection(ACCOUNT_CLOSURES_COLLECTION)
              .findOne({ userId, status: { $in: [...OPEN_CLOSURE_STATUSES] } }, { projection: { _id: 1 }, session }),
          ]);
          const refusal = args.decide({
            assignedBookingIds: held.map((doc) => String(doc._id)),
            balance: balance ? (balance.balance as number) : null,
            currency: balance ? (balance.currency as string) : null,
            pendingDepositId: deposit ? String(deposit._id) : null,
            closureOpen: closure !== null,
          });
          if (refusal) throw new MarketChangeAbort(refusal);

          await this.db
            .collection(PROFILES_COLLECTION)
            .updateOne({ userId }, { $set: { marketId: args.marketId, zoneIds: args.zoneIds, marketChangedAt: args.now } }, { session });
          if (args.currency && balance) {
            await this.db
              .collection(OPERATING_BALANCES_COLLECTION)
              .updateOne({ _id: userId } as Document, { $set: { currency: args.currency, updatedAt: args.now } }, { session });
          }
          return true;
        },
        { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' },
      );
      if (!changed) return { kind: 'not_a_goalkeeper' };
    } catch (error) {
      if (error instanceof MarketChangeAbort) return { kind: 'refused', refusal: error.refusal };
      throw error;
    } finally {
      await session.endSession();
    }
    const profile = await this.profiles.getByUserId(userId);
    return profile ? { kind: 'changed', profile } : { kind: 'not_a_goalkeeper' };
  }
}
