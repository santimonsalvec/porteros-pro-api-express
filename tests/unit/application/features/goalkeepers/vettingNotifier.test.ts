import { describe, expect, it, vi } from 'vitest';
import type { IPushNotifier } from '../../../../../src/application/features/devices/common/ports.js';
import { VettingNotifier } from '../../../../../src/application/features/goalkeepers/common/vettingNotifier.js';
import { FakeNotificationRepository } from '../../../../fakes/fakeNotificationRepository.js';
import { FakeUserLanguages } from '../../../../fakes/fakeUserLanguages.js';

const NOW = new Date('2026-10-15T15:00:00.000Z');

function setup(push: IPushNotifier['sendToUsers'] = vi.fn(async () => ({ totals: { reached: 1 } }) as never)) {
  const notifications = new FakeNotificationRepository();
  const warnings: Array<Record<string, unknown>> = [];
  let ids = 0;
  const notifier = new VettingNotifier({
    notifications,
    pushNotifier: { sendToUsers: push },
    userLanguages: new FakeUserLanguages(),
    idGenerator: { newId: () => `n-${++ids}` },
    clock: { now: () => NOW },
    logger: { info: () => undefined, warn: (entry) => warnings.push(entry) },
  });
  return { notifications, notifier, push, warnings };
}

describe('VettingNotifier (admin spec 030, research §11)', () => {
  it('tells a validated goalkeeper they can take matches now, once per decision', async () => {
    const { notifications, notifier, push } = setup();

    await notifier.validated('gk-1', 'log-1');
    await notifier.validated('gk-1', 'log-1');

    expect(notifications.all()).toHaveLength(1);
    expect(notifications.all()[0]).toMatchObject({ userId: 'gk-1', type: 'vetting.validated', title: 'Ya puedes recibir solicitudes' });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('gives the reason of a rejection', async () => {
    const { notifications, notifier } = setup();

    await notifier.validationRejected('gk-1', 'log-2', 'La foto del certificado no es legible');

    expect(notifications.all()[0]).toMatchObject({ type: 'vetting.validation_rejected', body: expect.stringContaining('La foto del certificado no es legible') });
  });

  it('celebrates the seal', async () => {
    const { notifications, notifier } = setup();

    await notifier.verified('gk-1', 'log-3');

    expect(notifications.all()[0]).toMatchObject({ type: 'vetting.verified', title: 'Ya tienes el sello de verificado' });
  });

  it('never fails the decision when the notice cannot be sent: it logs a warning', async () => {
    const { notifier, warnings } = setup(vi.fn(async () => {
      throw new Error('push down');
    }));

    await expect(notifier.verified('gk-1', 'log-4')).resolves.toBeUndefined();
    expect(warnings).toEqual([expect.objectContaining({ outcome: 'vetting_notice_failed', goalkeeperId: 'gk-1', kind: 'vetting.verified' })]);
  });
});
