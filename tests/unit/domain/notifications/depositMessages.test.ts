import { describe, expect, it } from 'vitest';
import { validatePushMessage } from '../../../../src/domain/devices/deviceRules.js';
import { depositApprovedMessage, depositFailedMessage } from '../../../../src/domain/notifications/depositMessages.js';

describe('deposit messages (feature 022)', () => {
  it('tells the goalkeeper what arrived and the new balance', () => {
    const message = depositApprovedMessage(17000, 37000, 'COP', 't-1');

    expect(message).toEqual({
      title: 'Depósito aprobado',
      body: 'Depósito aprobado: +17.000 COP. Tu saldo operativo es 37.000 COP.',
      data: { type: 'operating_balance.deposit_approved', depositId: 't-1' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });

  it('shows a balance still in debt', () => {
    expect(depositApprovedMessage(18536, -11464, 'COP', 't-1').body).toBe('Depósito aprobado: +18.536 COP. Tu saldo operativo es -11.464 COP.');
  });

  it('tells the goalkeeper a deposit did not go through', () => {
    const message = depositFailedMessage(20000, 'COP', 't-1');

    expect(message).toEqual({
      title: 'Depósito no completado',
      body: 'Tu depósito de 20.000 COP no se completó. Puedes intentar con otro medio de pago.',
      data: { type: 'operating_balance.deposit_failed', depositId: 't-1' },
    });
    expect(validatePushMessage(message)).toEqual({ ok: true });
  });
});
