import { GoogleAuth } from 'google-auth-library';
import type {
  Device,
  IPushSender,
  PushMessage,
  PushSendOutcome,
} from '../../application/features/devices/common/ports.js';

const FCM_ERROR_TYPE = 'type.googleapis.com/google.firebase.fcm.v1.FcmError';
const BAD_REQUEST_TYPE = 'type.googleapis.com/google.rpc.BadRequest';

interface FcmErrorBody {
  error?: {
    status?: string;
    details?: Array<{ '@type'?: string; errorCode?: string; fieldViolations?: Array<{ field?: string }> }>;
  };
}

type Classification = { outcome: PushSendOutcome; reason?: string };

/**
 * Sends through the FCM HTTP v1 API over REST (research §1), authenticated with Application
 * Default Credentials — the service account in production, no key file. One request per token:
 * HTTP v1 has no multi-token endpoint. Never throws; every answer is classified (research §6).
 */
export class FcmPushSender implements IPushSender {
  private readonly auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
  private readonly url: string;

  constructor(projectId: string) {
    this.url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  }

  async send(device: Device, message: PushMessage, signal: AbortSignal): Promise<Classification> {
    try {
      const response = await this.auth.request<FcmErrorBody>({
        url: this.url,
        method: 'POST',
        data: { message: toFcmMessage(device.token, message) },
        signal,
        validateStatus: () => true,
      });
      return classify(response.status, response.data);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      // Credentials that cannot even be loaded fail every send the same way.
      if (/default credentials|could not load|unable to detect a project/i.test(text)) {
        return { outcome: 'fatal', reason: 'credentials_unavailable' };
      }
      return { outcome: 'failed', reason: signal.aborted ? 'timeout' : 'network' };
    }
  }
}

/** Title and body for the system tray; `data` for the app's routing (research §12). */
function toFcmMessage(token: string, message: PushMessage): Record<string, unknown> {
  return {
    token,
    notification: { title: message.title, body: message.body },
    data: message.data,
    android: { priority: 'high', notification: { channel_id: 'default' } },
    apns: { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  };
}

/** Only answers about the token itself remove it; a bad payload or bad credentials never do. */
export function classify(status: number, body: FcmErrorBody | undefined): Classification {
  if (status >= 200 && status < 300) return { outcome: 'sent' };

  const details = body?.error?.details ?? [];
  const errorCode = details.find((detail) => detail['@type'] === FCM_ERROR_TYPE)?.errorCode;
  const aboutToken = details
    .filter((detail) => detail['@type'] === BAD_REQUEST_TYPE)
    .some((detail) => detail.fieldViolations?.some((violation) => violation.field === 'message.token'));

  switch (errorCode) {
    case 'UNREGISTERED':
    case 'SENDER_ID_MISMATCH':
      return { outcome: 'invalid', reason: errorCode.toLowerCase() };
    case 'INVALID_ARGUMENT':
      return aboutToken ? { outcome: 'invalid', reason: 'invalid_token' } : { outcome: 'failed', reason: 'invalid_argument' };
    case 'THIRD_PARTY_AUTH_ERROR':
      return { outcome: 'failed', reason: 'apns_auth' };
    case 'QUOTA_EXCEEDED':
    case 'UNAVAILABLE':
    case 'INTERNAL':
      return { outcome: 'failed', reason: errorCode.toLowerCase() };
  }
  if (status === 404) return { outcome: 'invalid', reason: 'unregistered' };
  if (status === 400) return aboutToken ? { outcome: 'invalid', reason: 'invalid_token' } : { outcome: 'failed', reason: 'invalid_argument' };
  if (status === 401 || status === 403) return { outcome: 'fatal', reason: body?.error?.status?.toLowerCase() ?? `http_${status}` };
  return { outcome: 'failed', reason: `http_${status}` };
}
