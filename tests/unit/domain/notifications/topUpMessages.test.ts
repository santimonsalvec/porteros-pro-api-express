import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { topUpApprovedMessage, topUpFailedMessage } from '../../../../src/domain/notifications/topUpMessages.js';

describe('top-up messages (feature 022)', () => {
  it('tells the goalkeeper what arrived and the new balance', () => {
    const message = topUpApprovedMessage(17000, 37000, 'COP', 't-1');

    expect(message).toEqual({
      title: 'Recarga aprobada',
      body: 'Recarga aprobada: +17.000 COP. Tu saldo es 37.000 COP.',
      data: { type: 'wallet.top_up_approved', topUpId: 't-1' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });

  it('shows a balance still in debt', () => {
    expect(topUpApprovedMessage(18536, -11464, 'COP', 't-1').body).toBe('Recarga aprobada: +18.536 COP. Tu saldo es -11.464 COP.');
  });

  it('tells the goalkeeper a top-up did not go through', () => {
    const message = topUpFailedMessage(20000, 'COP', 't-1');

    expect(message).toEqual({
      title: 'Recarga no completada',
      body: 'Tu recarga de 20.000 COP no se completó. Puedes intentar con otro medio de pago.',
      data: { type: 'wallet.top_up_failed', topUpId: 't-1' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });
});
