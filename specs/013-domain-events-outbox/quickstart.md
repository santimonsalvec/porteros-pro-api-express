# Quickstart: Reliable Domain Events and Scheduled Jobs

**Feature**: `013-domain-events-outbox` | [spec](./spec.md) | [contract](./contracts/internal-endpoints.md)

## 1. Automated checks

```bash
npm test && npm run lint
npm run test:http
npm run test:architecture
```

## 2. Local mode (default, no cloud)

`.env` needs nothing new: `EVENTS_MODE` defaults to `local`.

1. `npm run dev`. The log shows `events_mode: local` and the local sweep timer every 60 s.
2. Confirm a 2-goalkeeper quote (as in 010).
3. In `mongosh`:
   - `db.outbox.find()` shows 2 `booking.created` events with `status: 'published'`;
   - `db.eventDeliveryLog.find()` shows 2 entries, one per booking.
4. Accept one booking as a goalkeeper (012). Then `db.outbox` and `db.eventDeliveryLog` show one `goalkeeper.assigned` event.
5. Replay the confirmation. No new event appears.

## 3. Google Cloud setup (production / dev project)

This is the guide required by FR-026. It is copied to `docs/events-infrastructure.md` during implementation. Replace `PROJECT`, `REGION` and `SERVICE_URL` (the public URL of the App Hosting backend).

```bash
# Topics
gcloud pubsub topics create booking-events --project=PROJECT
gcloud pubsub topics create booking-events-dlq --project=PROJECT

# Identities that call the internal endpoints
gcloud iam service-accounts create events-push --display-name="Pub/Sub push to API" --project=PROJECT
gcloud iam service-accounts create sweep-invoker --display-name="Cloud Scheduler sweep" --project=PROJECT

# The API's runtime service account may publish
gcloud pubsub topics add-iam-policy-binding booking-events \
  --member="serviceAccount:<runtime SA of the App Hosting backend>" --role=roles/pubsub.publisher --project=PROJECT

# Push subscription with OIDC and dead-letter
gcloud pubsub subscriptions create booking-events-api --project=PROJECT \
  --topic=booking-events \
  --push-endpoint=SERVICE_URL/internal/events \
  --push-auth-service-account=events-push@PROJECT.iam.gserviceaccount.com \
  --push-auth-token-audience=SERVICE_URL \
  --ack-deadline=30 --min-retry-delay=10s --max-retry-delay=600s \
  --dead-letter-topic=booking-events-dlq --max-delivery-attempts=5

# A pull subscription to inspect dead letters
gcloud pubsub subscriptions create booking-events-dlq-review --topic=booking-events-dlq --project=PROJECT

# The Pub/Sub service agent needs to publish to the DLQ and ack from the source subscription
PSA=service-$(gcloud projects describe PROJECT --format='value(projectNumber)')@gcp-sa-pubsub.iam.gserviceaccount.com
gcloud pubsub topics add-iam-policy-binding booking-events-dlq --member="serviceAccount:$PSA" --role=roles/pubsub.publisher --project=PROJECT
gcloud pubsub subscriptions add-iam-policy-binding booking-events-api --member="serviceAccount:$PSA" --role=roles/pubsub.subscriber --project=PROJECT
# ...and to mint OIDC tokens for the push identity
gcloud iam service-accounts add-iam-policy-binding events-push@PROJECT.iam.gserviceaccount.com \
  --member="serviceAccount:$PSA" --role=roles/iam.serviceAccountTokenCreator --project=PROJECT

# Every-minute sweep
gcloud scheduler jobs create http porteros-sweep --project=PROJECT --location=REGION \
  --schedule="* * * * *" --http-method=POST --uri=SERVICE_URL/internal/sweep \
  --oidc-service-account-email=sweep-invoker@PROJECT.iam.gserviceaccount.com \
  --oidc-token-audience=SERVICE_URL --attempt-deadline=60s
```

Environment of the backend (`apphosting.yaml` `env`):

| Variable | Value |
|---|---|
| `EVENTS_MODE` | `pubsub` |
| `GCP_PROJECT_ID` | `PROJECT` |
| `EVENTS_TOPIC` | `booking-events` |
| `INTERNAL_OIDC_AUDIENCE` | `SERVICE_URL` |
| `INTERNAL_ALLOWED_INVOKERS` | `events-push@PROJECT.iam.gserviceaccount.com,sweep-invoker@PROJECT.iam.gserviceaccount.com` |

## 4. Manual checks (deferred to the end of the roadmap, like 010–012)

These checks are added to `_temp_pruebas.md`.

1. **End to end**: confirm a booking in the cloud environment. The delivery log has its events within 5 s (SC-002).
2. **0 lost events** (SC-001): with a wrong `EVENTS_TOPIC`, confirm a booking. The confirmation succeeds, and the event stays `pending`. Restore the topic, and within 2 minutes the event is `published` and in the delivery log.
3. **Idempotent consumer** (SC-003): from the Pub/Sub console, republish the same message 5 times. The delivery log has 1 entry.
4. **Concurrent sweeps** (SC-004): with 100 pending events, trigger `porteros-sweep` twice at once (`gcloud scheduler jobs run` ×2). Each event has `attempts` of 1 and 100 publications in total.
5. **Auth** (SC-005): `curl -X POST SERVICE_URL/internal/sweep`, with no token and with an app token, gives `401` both times.
6. **Dead letter**: make the consumer fail temporarily, with a `throw` in the delivery-log handler. After 5 attempts, the message is in `booking-events-dlq-review`.
