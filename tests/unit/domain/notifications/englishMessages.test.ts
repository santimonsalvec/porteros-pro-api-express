import { describe, expect, it } from 'vitest';
import { MatchFormat } from '../../../../src/domain/bookings/matchFormat.js';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { closureDebtDepositMessage, closureRefundMessage } from '../../../../src/domain/notifications/accountClosureMessages.js';
import { clientContactVisibleMessage, goalkeeperAssignedMessage, requestCompleteMessage } from '../../../../src/domain/notifications/assignmentMessages.js';
import { checkInMissedMessage, checkInOpenMessage } from '../../../../src/domain/notifications/checkInMessages.js';
import { depositApprovedMessage, operatingBalanceAdjustedMessage } from '../../../../src/domain/notifications/depositMessages.js';
import { noShowMessage } from '../../../../src/domain/notifications/noShowMessages.js';
import { groupedOfferMessage, localWhen, singleOfferMessage } from '../../../../src/domain/notifications/offerMessages.js';
import { adminCancelledMessage, bookingCancelledMessage, formatAmount, requestExpiredMessage, where } from '../../../../src/domain/notifications/outcomeMessages.js';
import { validationRejectedMessage } from '../../../../src/domain/notifications/vettingMessages.js';
import { goalkeeperSuspendedMessage, goalkeeperWithdrewMessage } from '../../../../src/domain/notifications/withdrawalMessages.js';

const match = { zoneName: 'Bello', marketName: 'Medellín', startsAt: new Date('2026-10-04T20:00:00.000Z'), timeZone: 'America/Bogota' };
const juan = { firstName: 'Juan', lastName: 'Pérez', whatsApp: '+57 300 1234567' };

describe('notices in English (feature 032)', () => {
  it('formats the local time the American way, and the amounts as the market does', () => {
    expect(localWhen(match.startsAt, 'America/Bogota', 'en')).toBe('Sun, Oct 4, 3:00 PM');
    expect(localWhen(new Date('2026-10-05T06:05:00.000Z'), 'America/Bogota', 'en')).toBe('Mon, Oct 5, 1:05 AM');
    expect(where(match, 'en')).toBe('in Bello · Sun, Oct 4, 3:00 PM');
    expect(where({ ...match, zoneName: null, marketName: null }, 'en')).toBe('in your zone · Sun, Oct 4, 3:00 PM');
    expect(formatAmount(7000, 'COP')).toBe('7.000 COP');
  });

  it('keeps the same data and type as the Spanish text', () => {
    const format = new MatchFormat({ modality: 'futbol_11', surfaceId: 'synthetic_grass', surfaceName: 'Grama sintética' });
    const offer = { ...match, durationMinutes: 90, format, requestId: 'r-1', bookingId: 'b-1' };

    const english = singleOfferMessage('en', offer);
    const spanish = singleOfferMessage('es', offer);

    expect(english).toEqual({
      title: 'Match available · 11-a-side',
      body: 'Bello · Sun, Oct 4, 3:00 PM · 90 min · Grama sintética',
      data: spanish.data,
    });
    expect(groupedOfferMessage('en', 3)).toEqual({ title: 'Matches available', body: 'There are 3 matches available in your zones', data: { type: 'bookings.available' } });
  });

  it('words every kind of notice', () => {
    expect(requestExpiredMessage('en', match, 'r-1').body).toBe('We could not find a goalkeeper for your match in Bello · Sun, Oct 4, 3:00 PM');
    expect(bookingCancelledMessage('en', match, 'r-1', 'b-1', { amount: 7000, currency: 'COP' }, 'client').body).toBe(
      'The client cancelled your match in Bello · Sun, Oct 4, 3:00 PM We refunded you 7.000 COP.',
    );
    expect(adminCancelledMessage('en', match, 'r-1', 'b-1', { remaining: 1 }).title).toBe('Goalkeeper cancelled');
    expect(goalkeeperAssignedMessage('en', match, 'r-1', 'b-1', { replacement: false, contact: juan }).body).toBe(
      'A goalkeeper took your match in Bello · Sun, Oct 4, 3:00 PM It is Juan Pérez · WhatsApp +57 300 1234567. We keep looking for the other one.',
    );
    expect(requestCompleteMessage('en', match, 'r-1', 'b-2', 2, [juan, { firstName: null, lastName: null, whatsApp: null }]).body).toBe(
      'Done! Your 2 goalkeepers are confirmed for the match in Bello · Sun, Oct 4, 3:00 PM They are Juan Pérez · WhatsApp +57 300 1234567 and your goalkeeper.',
    );
    expect(clientContactVisibleMessage('en', match, 'r-1', 'b-1', { firstName: null, lastName: null, whatsApp: null }).body).toBe(
      'Your client for the match in Bello · Sun, Oct 4, 3:00 PM: the client.',
    );
    expect(checkInMissedMessage('en', match, 'r-1', 'b-1', juan).body).toBe(
      'Your goalkeeper Juan Pérez has not confirmed their arrival at the match in Bello · Sun, Oct 4, 3:00 PM Write to them: WhatsApp +57 300 1234567.',
    );
    expect(checkInOpenMessage('en', match, 'r-1', 'b-1').title).toBe('Confirm your arrival');
    expect(noShowMessage('en', match, 'r-1', 'b-1', new Date('2026-10-07T23:00:00.000Z')).body).toBe(
      'You did not confirm your arrival at the match in Bello · Sun, Oct 4, 3:00 PM and it was recorded as a no-show. You are suspended until Wed, Oct 7, 6:00 PM',
    );
    expect(goalkeeperWithdrewMessage('en', match, 'r-1', 'b-1', true).body).toBe(
      'Your goalkeeper withdrew from the match in Bello · Sun, Oct 4, 3:00 PM We are already looking for another goalkeeper.',
    );
    expect(goalkeeperSuspendedMessage('en', new Date('2026-10-07T18:30:00.000Z'), 'America/Bogota', 'r-1', 'b-1').body).toBe(
      'You are suspended until Wed, Oct 7, 1:30 PM for withdrawing from a match. Meanwhile you will not see matches or receive offers.',
    );
    expect(validationRejectedMessage('en', 'blurry photo').body).toBe('Your validation was rejected: blurry photo. Fix it and upload your documents again.');
    expect(depositApprovedMessage('en', 17000, 37000, 'COP', 't-1').body).toBe('Deposit approved: +17.000 COP. Your operating balance is 37.000 COP.');
    expect(operatingBalanceAdjustedMessage('en', -5000, 'Test', 10000, 'COP').body).toBe('−5.000 COP (Test). Your operating balance is 10.000 COP.');
    expect(closureDebtDepositMessage('en', 5000, 'COP', 'c-1').body).toBe('Deposit 5.000 COP to cover your negative operating balance.');
    expect(closureRefundMessage('en', 0, 'COP', 'c-1').body).toBe('There was no balance to refund.');
  });

  it('never has a double period or a non-breaking space, and is a valid push', () => {
    for (const message of [
      requestExpiredMessage('en', match, 'r'),
      goalkeeperAssignedMessage('en', match, 'r', 'b', { replacement: true, contact: juan }),
      checkInMissedMessage('en', match, 'r', 'b', juan),
      noShowMessage('en', match, 'r', 'b', null),
      goalkeeperWithdrewMessage('en', match, 'r', 'b', false),
    ]) {
      expect(message.body).not.toMatch(/\.\.|\u00a0|\u202f/);
      expect(validatePushMessage(message)).toMatchObject({ ok: true });
    }
  });
});
