# Eventos de dominio: infraestructura en Google Cloud

Guía de la feature 013 (`specs/013-domain-events-outbox/`). Explica qué crear en Google Cloud para que los eventos de dominio lleguen a sus consumidores y para que el barrido corra cada minuto. También explica cómo trabajar sin nube en local.

## Cómo funciona (resumen)

1. Cuando pasa algo relevante (por ejemplo, se crea una reserva o se asigna un portero), el evento se guarda en la colección `outbox` **en la misma transacción** que el cambio.
2. Antes de responder, el API publica el evento, con un tope de 2 s. Si no lo logra, el evento queda `pending`.
3. Cada minuto, `POST /internal/sweep` publica los eventos pendientes y ejecuta los trabajos programados. En la nube lo llama Cloud Scheduler; en local, un timer.
4. Pub/Sub entrega cada evento a `POST /internal/events`. Los consumidores son idempotentes. Tras 5 intentos fallidos, el mensaje va al dead-letter.

Los endpoints `/internal/*` solo aceptan el token OIDC de Google de las cuentas de servicio configuradas. Nunca aceptan el JWT de la app, ni siquiera el de un administrador.

## Modo local (por defecto)

Sin configurar nada, `EVENTS_MODE` vale `local`:

- los eventos se entregan en el mismo proceso a los mismos consumidores, con la misma idempotencia;
- un timer ejecuta el barrido cada 60 s;
- los endpoints `/internal/*` rechazan todo (`401`), porque no hay audiencia configurada.

Para ver la cadena: confirma una reserva y revisa `db.outbox` (eventos `published`) y `db.eventDeliveryLog` (un registro por evento).

Si el backend desplegado y tu máquina apuntan a la misma base, los dos barren el mismo `outbox`. Es seguro: cada evento se reclama con un lease, así que nunca se publica dos veces en la misma pasada.

## Recursos en Google Cloud

Reemplaza `PROJECT`, `REGION` y `SERVICE_URL` (la URL pública del backend de App Hosting, sin `/` final).

### 1. Topics

```bash
gcloud pubsub topics create booking-events --project=PROJECT
gcloud pubsub topics create booking-events-dlq --project=PROJECT
```

Un solo topic lleva todos los tipos de evento. El tipo va en el atributo `type` de cada mensaje, por si alguna suscripción necesita filtrar.

### 2. Cuentas de servicio que llaman al API

```bash
gcloud iam service-accounts create events-push --display-name="Pub/Sub push to API" --project=PROJECT
gcloud iam service-accounts create sweep-invoker --display-name="Cloud Scheduler sweep" --project=PROJECT
```

### 3. Permiso del API para publicar

La cuenta de servicio con la que corre el backend de App Hosting debe poder publicar:

```bash
gcloud pubsub topics add-iam-policy-binding booking-events --project=PROJECT \
  --member="serviceAccount:<cuenta de runtime del backend>" --role=roles/pubsub.publisher
```

### 4. Suscripción push, con OIDC y dead-letter

```bash
gcloud pubsub subscriptions create booking-events-api --project=PROJECT \
  --topic=booking-events \
  --push-endpoint=SERVICE_URL/internal/events \
  --push-auth-service-account=events-push@PROJECT.iam.gserviceaccount.com \
  --push-auth-token-audience=SERVICE_URL \
  --ack-deadline=30 --min-retry-delay=10s --max-retry-delay=600s \
  --dead-letter-topic=booking-events-dlq --max-delivery-attempts=5

# Para revisar a mano los mensajes que fallaron 5 veces
gcloud pubsub subscriptions create booking-events-dlq-review --topic=booking-events-dlq --project=PROJECT
```

El agente de servicio de Pub/Sub necesita tres permisos:
- publicar en el dead-letter;
- confirmar mensajes de la suscripción de origen;
- emitir el token OIDC de `events-push`.

```bash
PSA=service-$(gcloud projects describe PROJECT --format='value(projectNumber)')@gcp-sa-pubsub.iam.gserviceaccount.com
gcloud pubsub topics add-iam-policy-binding booking-events-dlq --project=PROJECT \
  --member="serviceAccount:$PSA" --role=roles/pubsub.publisher
gcloud pubsub subscriptions add-iam-policy-binding booking-events-api --project=PROJECT \
  --member="serviceAccount:$PSA" --role=roles/pubsub.subscriber
gcloud iam service-accounts add-iam-policy-binding events-push@PROJECT.iam.gserviceaccount.com --project=PROJECT \
  --member="serviceAccount:$PSA" --role=roles/iam.serviceAccountTokenCreator
```

### 5. Barrido cada minuto

```bash
gcloud scheduler jobs create http porteros-sweep --project=PROJECT --location=REGION \
  --schedule="* * * * *" --http-method=POST --uri=SERVICE_URL/internal/sweep \
  --oidc-service-account-email=sweep-invoker@PROJECT.iam.gserviceaccount.com \
  --oidc-token-audience=SERVICE_URL --attempt-deadline=60s
```

### 6. Variables de entorno del backend

Se configuran en Firebase Console (App Hosting → Environment variables):

| Variable | Valor |
|---|---|
| `EVENTS_MODE` | `pubsub` |
| `GCP_PROJECT_ID` | `PROJECT` |
| `EVENTS_TOPIC` | `booking-events` (valor por defecto) |
| `INTERNAL_OIDC_AUDIENCE` | `SERVICE_URL` |
| `INTERNAL_ALLOWED_INVOKERS` | `events-push@PROJECT.iam.gserviceaccount.com,sweep-invoker@PROJECT.iam.gserviceaccount.com` |

Con `EVENTS_MODE=pubsub`, el API no arranca si falta `GCP_PROJECT_ID`, `INTERNAL_OIDC_AUDIENCE` o `INTERNAL_ALLOWED_INVOKERS`.

Mientras no se configure, el backend desplegado corre en modo `local`: registra un aviso en el log al arrancar, publica en el mismo proceso y rechaza `/internal/*`. Nada se pierde. Los eventos quedan en `outbox` y los consumidores locales los procesan.

## Operación

- **Mensajes en el dead-letter**:
  ```bash
  gcloud pubsub subscriptions pull booking-events-dlq-review --project=PROJECT --limit=10 --auto-ack=false
  ```
  Revisa el log `event_handlers_failed` del API para ver qué consumidor falló. Para reintentar, vuelve a publicar el `data` del mensaje en `booking-events`: los consumidores ignoran lo que ya procesaron.
- **Eventos atascados**: el log `events_pending_too_long` aparece cuando un evento lleva más de 5 minutos pendiente. Consulta:
  ```js
  db.outbox.find({ status: 'pending' }).sort({ createdAt: 1 })
  ```
- **Retención**: los eventos publicados se borran a los 7 días (índice TTL). `processedEvents` y `eventDeliveryLog` se borran a los 30 días. Los pendientes nunca se borran.
- **Emulador de Pub/Sub** (opcional): el modo local no lo necesita. Solo sirve para probar el cliente real contra `gcloud beta emulators pubsub start`.
