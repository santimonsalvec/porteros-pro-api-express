import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Device, PushMessage } from '../../../../src/application/features/devices/common/ports.js';

const request = vi.fn();
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(function GoogleAuth() {
    return { request };
  }),
}));

const { FcmPushSender } = await import('../../../../src/infrastructure/push/fcmPushSender.js');

const device: Device = { token: 'fcm-token-1', userId: 'user-a', platform: 'android', lastSeenAt: new Date() };
const message: PushMessage = { title: 'PorterosPRO', body: 'Prueba', data: { type: 'test', bookingId: 'b-1' } };
const signal = () => new AbortController().signal;

const fcmError = (status: number, errorCode?: string, tokenField = false) => ({
  status,
  data: {
    error: {
      status: 'SOME_STATUS',
      details: [
        ...(errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : []),
        ...(tokenField
          ? [{ '@type': 'type.googleapis.com/google.rpc.BadRequest', fieldViolations: [{ field: 'message.token' }] }]
          : []),
      ],
    },
  },
});

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ status: 200, data: { name: 'projects/p/messages/1' } });
});

describe('FcmPushSender (mocked Google client)', () => {
  it('posts one message to the FCM v1 endpoint with notification, data and platform blocks', async () => {
    const abort = signal();

    expect(await new FcmPushSender('porteros-dev').send(device, message, abort)).toEqual({ outcome: 'sent' });

    const options = request.mock.calls[0]![0];
    expect(options).toMatchObject({
      url: 'https://fcm.googleapis.com/v1/projects/porteros-dev/messages:send',
      method: 'POST',
      signal: abort,
    });
    expect(options.validateStatus(500)).toBe(true);
    expect(options.data).toEqual({
      message: {
        token: 'fcm-token-1',
        notification: { title: 'PorterosPRO', body: 'Prueba' },
        data: { type: 'test', bookingId: 'b-1' },
        android: { priority: 'high', notification: { channel_id: 'default' } },
        apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
      },
    });
  });

  it.each([
    ['UNREGISTERED (404)', fcmError(404, 'UNREGISTERED'), 'invalid'],
    ['a bare 404', fcmError(404), 'invalid'],
    ['SENDER_ID_MISMATCH', fcmError(403, 'SENDER_ID_MISMATCH'), 'invalid'],
    ['INVALID_ARGUMENT about the token', fcmError(400, 'INVALID_ARGUMENT', true), 'invalid'],
    ['INVALID_ARGUMENT about our payload', fcmError(400, 'INVALID_ARGUMENT'), 'failed'],
    ['THIRD_PARTY_AUTH_ERROR (APNs key)', fcmError(401, 'THIRD_PARTY_AUTH_ERROR'), 'failed'],
    ['QUOTA_EXCEEDED', fcmError(429, 'QUOTA_EXCEEDED'), 'failed'],
    ['UNAVAILABLE', fcmError(503, 'UNAVAILABLE'), 'failed'],
    ['INTERNAL', fcmError(500, 'INTERNAL'), 'failed'],
    ['our credentials refused (401)', fcmError(401), 'fatal'],
    ['our permission denied (403)', fcmError(403), 'fatal'],
    ['an unexpected status', { status: 502, data: undefined }, 'failed'],
  ])('classifies %s as %s', async (_label, response, outcome) => {
    request.mockResolvedValueOnce(response);

    const result = await new FcmPushSender('p').send(device, message, signal());

    expect(result.outcome).toBe(outcome);
    expect(JSON.stringify(result)).not.toContain('fcm-token-1');
  });

  it('treats a network error or a timeout as a temporary failure', async () => {
    request.mockRejectedValueOnce(new Error('socket hang up'));
    expect(await new FcmPushSender('p').send(device, message, signal())).toEqual({ outcome: 'failed', reason: 'network' });

    const controller = new AbortController();
    controller.abort();
    request.mockRejectedValueOnce(new Error('This operation was aborted'));
    expect(await new FcmPushSender('p').send(device, message, controller.signal)).toEqual({ outcome: 'failed', reason: 'timeout' });
  });

  it('treats credentials that cannot be loaded as fatal', async () => {
    request.mockRejectedValueOnce(new Error('Could not load the default credentials.'));

    expect(await new FcmPushSender('p').send(device, message, signal())).toEqual({
      outcome: 'fatal',
      reason: 'credentials_unavailable',
    });
  });
});
