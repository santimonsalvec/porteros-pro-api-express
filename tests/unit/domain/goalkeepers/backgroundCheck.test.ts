import { describe, expect, it } from 'vitest';
import {
  BackgroundCheck,
  BackgroundCheckReviewedError,
  canApproveValidation,
  defaultBackgroundCheckExpiry,
} from '../../../../src/domain/goalkeepers/backgroundCheck.js';

const UPLOADED = new Date('2026-10-10T12:00:00.000Z');
const REVIEWED = new Date('2026-10-15T15:00:00.000Z');
const pending = BackgroundCheck.upload('bc-1', 'gk-1', 'img-1', UPLOADED);
const photos = { documentPhotoAId: 'a', documentPhotoBId: 'b' };

describe('BackgroundCheck (admin spec 030)', () => {
  it('starts pending, unreviewed and without expiry', () => {
    expect(pending).toMatchObject({ status: 'pending', reviewedAt: null, reviewedBy: null, rejectionReason: null, expiresAt: null, revision: 0 });
    expect(pending.isActiveAt(REVIEWED)).toBe(true);
  });

  it('is approved for one year by default (FR-004a)', () => {
    const approved = pending.approve('staff-1', REVIEWED);

    expect(approved).toMatchObject({ status: 'approved', reviewedAt: REVIEWED, reviewedBy: 'staff-1', revision: 1 });
    expect(approved.expiresAt).toEqual(new Date('2027-10-15T15:00:00.000Z'));
    expect(defaultBackgroundCheckExpiry(new Date('2028-02-29T10:00:00.000Z'))).toEqual(new Date('2029-03-01T10:00:00.000Z'));
  });

  it('takes another expiry when the administrator sets one, never a past one', () => {
    const until = new Date('2027-01-31T00:00:00.000Z');

    expect(pending.approve('staff-1', REVIEWED, until).expiresAt).toEqual(until);
    expect(() => pending.approve('staff-1', REVIEWED, REVIEWED)).toThrow(/future/);
  });

  it('is rejected with a trimmed reason', () => {
    const rejected = pending.reject('staff-1', REVIEWED, '  Ilegible  ');

    expect(rejected).toMatchObject({ status: 'rejected', rejectionReason: 'Ilegible', expiresAt: null });
    expect(rejected.isActiveAt(REVIEWED)).toBe(false);
    expect(() => pending.reject('staff-1', REVIEWED, 'ab')).toThrow();
  });

  it('is reviewed only once', () => {
    const approved = pending.approve('staff-1', REVIEWED);

    expect(() => approved.approve('staff-1', REVIEWED)).toThrow(BackgroundCheckReviewedError);
    expect(() => approved.reject('staff-1', REVIEWED, 'motivo')).toThrow(BackgroundCheckReviewedError);
  });

  it('knows when it expired or expires within 30 days, without changing the goalkeeper (FR-004b)', () => {
    const approved = pending.approve('staff-1', REVIEWED, new Date('2026-11-10T00:00:00.000Z'));

    expect(approved.isExpiredAt(new Date('2026-11-09T23:59:59.999Z'))).toBe(false);
    expect(approved.isExpiredAt(new Date('2026-11-10T00:00:00.000Z'))).toBe(true);
    expect(approved.isExpiringSoonAt(new Date('2026-10-11T00:00:00.000Z'))).toBe(true);
    expect(approved.isExpiringSoonAt(new Date('2026-10-10T23:59:59.000Z'))).toBe(false);
    expect(approved.isExpiringSoonAt(new Date('2026-11-10T00:00:00.000Z'))).toBe(false);
    expect(approved.isActiveAt(new Date('2026-11-10T00:00:00.000Z'))).toBe(false);
  });
});

describe('canApproveValidation (FR-004)', () => {
  it('needs one approved, unexpired background check and nothing left to review', () => {
    const approved = pending.approve('staff-1', REVIEWED);

    expect(canApproveValidation(photos, [approved], REVIEWED)).toEqual({ ok: true, missing: [] });
    expect(canApproveValidation(photos, [approved, BackgroundCheck.upload('bc-2', 'gk-1', 'img-2', REVIEWED)], REVIEWED)).toEqual({
      ok: false,
      missing: ['pending_background_checks'],
    });
  });

  it('a rejected one does not block when another is approved', () => {
    const rejected = BackgroundCheck.upload('bc-2', 'gk-1', 'img-2', UPLOADED).reject('staff-1', REVIEWED, 'Ilegible');

    expect(canApproveValidation(photos, [pending.approve('staff-1', REVIEWED), rejected], REVIEWED).ok).toBe(true);
  });

  it('lists everything missing', () => {
    const expired = pending.approve('staff-1', REVIEWED, new Date('2026-10-20T00:00:00.000Z'));

    expect(canApproveValidation({ documentPhotoAId: 'a', documentPhotoBId: '' }, [expired], new Date('2026-10-21T00:00:00.000Z'))).toEqual({
      ok: false,
      missing: ['identification_photos', 'approved_background_check'],
    });
    expect(canApproveValidation(photos, [], REVIEWED).missing).toEqual(['approved_background_check']);
  });
});
