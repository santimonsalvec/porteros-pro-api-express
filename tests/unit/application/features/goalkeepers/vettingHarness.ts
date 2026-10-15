import { FakeBackgroundCheckRepository } from '../../../../fakes/fakeBackgroundCheckRepository.js';
import { FakeGoalkeeperProfileRepository } from '../../../../fakes/fakeGoalkeeperProfileRepository.js';
import { FakeVettingLogRepository } from '../../../../fakes/fakeVettingLogRepository.js';
import { FakeImageRepository } from '../../../../fakes/fakeImageRepository.js';
import { FakeUserBlockRepository } from '../../../../fakes/fakeUserBlockRepository.js';
import { buildGoalkeeperProfile } from '../../../../fixtures/operatingBalanceFixtures.js';
import { BackgroundCheck } from '../../../../../src/domain/goalkeepers/backgroundCheck.js';
import { PENDING_VETTING, type Vetting } from '../../../../../src/domain/goalkeepers/vetting.js';

export const VETTING_NOW = new Date('2026-10-15T15:00:00.000Z');

/** Records what the goalkeeper would be told, instead of sending it. */
export class RecordingVettingNotifier {
  readonly sent: Array<{ kind: 'validated' | 'validation_rejected' | 'verified'; goalkeeperId: string; logEntryId: string; reason?: string }> = [];

  async validated(goalkeeperId: string, logEntryId: string): Promise<void> {
    this.sent.push({ kind: 'validated', goalkeeperId, logEntryId });
  }

  async validationRejected(goalkeeperId: string, logEntryId: string, reason: string): Promise<void> {
    this.sent.push({ kind: 'validation_rejected', goalkeeperId, logEntryId, reason });
  }

  async verified(goalkeeperId: string, logEntryId: string): Promise<void> {
    this.sent.push({ kind: 'verified', goalkeeperId, logEntryId });
  }
}

/** Fake-backed dependencies of the vetting handlers (admin spec 030). */
export class VettingHarness {
  readonly profiles = new FakeGoalkeeperProfileRepository();
  readonly checks = new FakeBackgroundCheckRepository();
  readonly log = new FakeVettingLogRepository();
  readonly notifier = new RecordingVettingNotifier();
  readonly images = new FakeImageRepository();
  readonly blocks = new FakeUserBlockRepository();
  private ids = 0;
  readonly idGenerator = { newId: () => `id-${++this.ids}` };
  now = VETTING_NOW;
  readonly clock = { now: () => this.now };

  get deps() {
    return {
      profiles: this.profiles,
      checks: this.checks,
      log: this.log,
      notifier: this.notifier,
      idGenerator: this.idGenerator,
      clock: this.clock,
      images: this.images,
      blocks: this.blocks,
    };
  }

  goalkeeper(userId: string, vetting: Vetting = PENDING_VETTING, zoneIds = ['zone-cali-norte']): void {
    this.profiles.seed(buildGoalkeeperProfile(userId, { vetting, zoneIds }));
  }

  /** A background check of the goalkeeper, approved unless `pending` is asked for. */
  check(goalkeeperId: string, id: string, state: 'pending' | 'approved' = 'approved'): BackgroundCheck {
    const uploaded = BackgroundCheck.upload(id, goalkeeperId, `img-${id}`, new Date('2026-10-10T00:00:00.000Z'));
    const check = state === 'approved' ? uploaded.approve('staff-0', new Date('2026-10-11T00:00:00.000Z')) : uploaded;
    this.checks.seed(check);
    return check;
  }

  async vettingOf(userId: string): Promise<Vetting> {
    return (await this.profiles.getByUserId(userId))!.vetting;
  }
}
