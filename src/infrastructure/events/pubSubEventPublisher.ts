import { GoogleAuth } from 'google-auth-library';
import type { IEventPublisher } from '../../application/features/events/common/ports.js';
import type { DomainEvent } from '../../domain/events/domainEvent.js';

const MAX_MESSAGES_PER_CALL = 100;

/**
 * Publishes to Google Cloud Pub/Sub through its REST API (research §9), authenticated with
 * Application Default Credentials — the Cloud Run service account in production. One message per
 * event: `data` is the event JSON, attributes carry type, id and version so subscriptions can
 * filter without decoding.
 */
export class PubSubEventPublisher implements IEventPublisher {
  private readonly auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/pubsub'] });
  private readonly url: string;

  constructor(projectId: string, topic: string) {
    this.url = `https://pubsub.googleapis.com/v1/projects/${projectId}/topics/${topic}:publish`;
  }

  async publish(events: readonly DomainEvent[], signal?: AbortSignal): Promise<void> {
    for (let start = 0; start < events.length; start += MAX_MESSAGES_PER_CALL) {
      const messages = events.slice(start, start + MAX_MESSAGES_PER_CALL).map((event) => ({
        data: Buffer.from(JSON.stringify(event)).toString('base64'),
        attributes: { type: event.type, eventId: event.id, version: String(event.version) },
      }));
      const response = await this.auth.request({ url: this.url, method: 'POST', data: { messages }, signal });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Pub/Sub publish failed with status ${response.status}`);
      }
    }
  }
}
