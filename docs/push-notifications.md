# Notificaciones push: backend, Firebase y app Flutter

Guía de la feature 014 (`specs/014-fcm-device-registration/`). Explica qué configurar en Firebase y Google Cloud para que el backend envíe pushes, y cómo integrar la app Flutter: permisos, registro del token, cierre de sesión y apertura de la pantalla correcta al tocar un aviso.

## Cómo funciona (resumen)

1. Tras iniciar sesión, la app obtiene el **token FCM** del teléfono y lo registra con `POST /api/devices`. Lo vuelve a registrar cada vez que abre la app y cada vez que FCM emite un token nuevo.
2. Un token pertenece a **un solo usuario**. Si otra persona inicia sesión en el mismo teléfono y registra el token, el token pasa a ella.
3. Al cerrar sesión, la app llama `POST /api/devices/unregister` **antes** de descartar la sesión.
4. Para enviar un push, el backend busca los dispositivos de los usuarios destinatarios y llama a FCM por cada token. Si FCM dice que un token ya no sirve (app desinstalada, token reemplazado), el backend lo borra en ese momento. Los fallos temporales no borran nada.
5. Un dispositivo que no se vuelve a registrar en **60 días** se borra solo (índice TTL de MongoDB).

El token **nunca** va en la URL ni en los logs. Los logs usan `tokenRef`, los primeros 12 caracteres del sha256 del token.

## Endpoints

Los tres requieren sesión (`Authorization: Bearer …`). Aceptan cualquier rol (cliente, portero o administrador) y no exigen el perfil completo.

| Método y ruta | Body | Respuesta |
|---|---|---|
| `POST /api/devices` | `{ "token": "…", "platform": "ios" \| "android" }` | `204` siempre que se guarde: nuevo, refrescado o pasado desde otro usuario |
| `POST /api/devices/unregister` | `{ "token": "…" }` | `204` siempre, aunque el token no exista o sea de otro usuario |
| `POST /api/devices/test-push` | vacío | `200 { reached, removed, failed, noDevice }`. `429` con `Retry-After` tras 5 en un minuto |

Contrato completo: `specs/014-fcm-device-registration/contracts/devices-endpoints.md`.

## Convención de datos del push

Todo push lleva, además del título y el cuerpo, un mapa `data` de **strings**. La app decide qué pantalla abrir con él.

| Clave | Obligatoria | Significado |
|---|---|---|
| `type` | sí | Qué pasó. La app enruta por este valor. `test` (014); los demás los definen 015 (`booking.available`, `bookings.available`) y 019 (`request.*`). |
| `bookingId` | cuando aplica | uuid de la reserva a abrir |
| `requestId` | cuando aplica | uuid de la solicitud a abrir |
| `v` | no | Versión del payload; `"1"` si no viene |

Un `type` desconocido abre el inicio o la bandeja, y la app lo registra en sus logs.

### Desenlaces de la solicitud (feature 016)

| `type` | Para | Cuándo | Qué abre la app |
|---|---|---|---|
| `request.expired` | cliente | Ninguna reserva de la solicitud consiguió portero | La solicitud (`requestId`) |
| `request.partially_expired` | cliente | "Quedarme con los confirmados": se consiguieron algunos porteros y el resto venció | La solicitud |
| `request.cancelled` | cliente | "Cancelar todo" y la solicitud no estaba completa a inicio − 60 min | La solicitud |
| `booking.cancelled` | portero | Su partido se canceló, por "cancelar todo" (016) o porque el cliente lo canceló (017, "El cliente canceló tu partido…"); el texto dice cuánto se le devolvió | Su agenda (`bookingId`) |

La cotización trae `cancelAllAvailable` y `cancelAllUntil`: cuando `cancelAllAvailable` es `false`, el formulario no debe ofrecer "cancelar todo" (confirmar con esa opción responde `409 cancel_all_not_available`).

### Ofertas a porteros (feature 015)

| `type` | Cuándo | Qué abre la app |
|---|---|---|
| `booking.available` | Primer aviso de un partido, o recordatorio de una sola oferta | El partido (`bookingId`) dentro de "partidos disponibles" |
| `bookings.available` | Recordatorio que agrupa varias ofertas ("Hay N partidos disponibles en tus zonas") | La lista de "partidos disponibles" |

- Cuando el portero abre una oferta, desde la bandeja o tocando el push, la app llama **`POST /api/notifications/{notificationId}/read`**. Eso la marca como abierta y **detiene sus recordatorios**. El `notificationId` sale de `GET /api/notifications`; para ubicar la oferta de un push, la app busca en la bandeja la entrada con el mismo `data.requestId`.
- "Descartar" (`POST /api/notifications/{id}/dismiss`) también detiene los recordatorios.
- Cada oferta recibe como máximo 3 recordatorios, con al menos 5 minutos entre pushes al mismo portero, a cualquier hora.
- Con **"disponible para ofertas"** apagado (`PUT /api/goalkeepers/me/offers-availability`), no llegan ofertas, "partidos disponibles" aparece vacío (`unavailableReason: not_available_for_offers`) y aceptar responde `409 goalkeeper_not_available`. Al prenderlo, llegan de inmediato las ofertas de los partidos abiertos. La app debe mostrar el interruptor en un lugar visible.

Bloques por plataforma que añade el backend:
- Android: prioridad `high` y canal `default`;
- iOS: `apns-priority: 10` y sonido `default`.

## Modo local (por defecto)

Sin configurar nada, `PUSH_MODE` vale `log`: el backend **no envía** nada y solo escribe en el log `push_sent` con `tokenRef`, el título y las claves de `data`. Sirve para probar el registro y la lógica sin Firebase.

Para recibir pushes reales en un teléfono desde tu máquina (por ejemplo con la skill `levanta-la-app`):

1. `gcloud auth application-default login` con una cuenta que tenga el rol **Firebase Cloud Messaging API Admin** en el proyecto de Firebase.
2. En `.env`:

   ```text
   PUSH_MODE=fcm
   FIREBASE_PROJECT_ID=<id del proyecto de Firebase>
   ```
3. Levanta el API y la app, inicia sesión, acepta las notificaciones y llama `POST /api/devices/test-push`.

## Configuración en la nube (una vez por entorno)

| Paso | Dónde | Valor |
|---|---|---|
| Habilitar la **Firebase Cloud Messaging API** (`fcm.googleapis.com`) | Google Cloud Console → APIs y servicios | el proyecto de Firebase de la app |
| Dar `roles/firebasecloudmessaging.admin` a la cuenta de servicio del backend | IAM | la cuenta de servicio de ejecución de App Hosting / Cloud Run |
| Subir la **clave de autenticación de APNs** (.p8) con su Key ID y Team ID | Firebase Console → Configuración del proyecto → Cloud Messaging → Configuración de la app de Apple | una sola clave sirve para desarrollo y producción |
| `PUSH_MODE=fcm` y `FIREBASE_PROJECT_ID` | variables de entorno de App Hosting (`apphosting.yaml`) | |
| Opcionales: `PUSH_DEVICE_INACTIVITY_DAYS`, `PUSH_MAX_DEVICES_PER_USER`, `PUSH_TEST_LIMIT_PER_MINUTE` | lo mismo | por defecto 60 / 10 / 5 |

```bash
gcloud services enable fcm.googleapis.com --project=PROJECT
gcloud projects add-iam-policy-binding PROJECT \
  --member="serviceAccount:RUNTIME_SERVICE_ACCOUNT" \
  --role="roles/firebasecloudmessaging.admin"
```

No se crea ningún archivo de clave: el backend firma con la identidad de su propia cuenta de servicio. Con `PUSH_MODE=fcm` y sin `FIREBASE_PROJECT_ID`, el backend no arranca.

Si cambias `PUSH_DEVICE_INACTIVITY_DAYS`, el backend ajusta el TTL existente al arrancar (`collMod`), sin borrar el índice.

## App Flutter

### 1. Paquetes y configuración

```bash
flutter pub add firebase_core firebase_messaging flutter_local_notifications
flutterfire configure   # genera lib/firebase_options.dart
```

`flutter_local_notifications` sirve para mostrar un aviso cuando llega un push con la app abierta en Android, porque en primer plano el sistema no lo muestra.

### 2. iOS

- En Xcode → Signing & Capabilities: agrega **Push Notifications**, y **Background Modes → Remote notifications**.
- La clave de APNs debe estar subida en Firebase (ver la tabla anterior). Sin ella, FCM responde `THIRD_PARTY_AUTH_ERROR`: el backend lo registra como error y no borra el token.
- Prueba en un **iPhone real**. El simulador solo recibe pushes en Macs con Apple silicon e iOS 16 o superior.

### 3. Android

- Android 13 o superior exige el permiso `POST_NOTIFICATIONS`. `requestPermission()` lo pide.
- Crea el canal `default` al arrancar. El backend envía `channel_id: default`.

### 4. Permiso

- Pídelo **después** de iniciar sesión, con una explicación breve antes ("para avisarte cuando haya partidos o cuando tu portero esté confirmado").
- Si lo niega, la app sigue funcionando: la bandeja dentro de la app (feature 015) muestra todo.
- Ofrece más adelante un acceso a los ajustes del sistema para activarlas.

### 5. Registrar el token

```dart
Future<void> registerPushToken(ApiClient api) async {
  final messaging = FirebaseMessaging.instance;
  final settings = await messaging.requestPermission();
  if (settings.authorizationStatus == AuthorizationStatus.denied) return;

  if (Platform.isIOS) {
    // En iOS el token FCM depende del token de APNs: espera a que exista.
    var apns = await messaging.getAPNSToken();
    for (var i = 0; apns == null && i < 10; i++) {
      await Future.delayed(const Duration(milliseconds: 500));
      apns = await messaging.getAPNSToken();
    }
    if (apns == null) return; // se reintenta en el próximo arranque
  }

  final token = await messaging.getToken();
  if (token != null) await api.registerDevice(token, Platform.isIOS ? 'ios' : 'android');
}

// Una sola vez, al arrancar la app con sesión:
FirebaseMessaging.instance.onTokenRefresh.listen((token) {
  api.registerDevice(token, Platform.isIOS ? 'ios' : 'android');
});
```

- Llama `registerPushToken` tras iniciar sesión y en **cada arranque** con sesión: así se mantiene el "último uso" y el dispositivo no vence a los 60 días.
- Si falla (sin red, por ejemplo), no bloquees la interfaz: se reintenta en el próximo arranque.

### 6. Cerrar sesión

El orden importa:

1. `POST /api/devices/unregister` con el token actual. Si el access token venció, refresca la sesión primero (`POST /api/auth/tokens/refresh`).
2. `await FirebaseMessaging.instance.deleteToken();`
3. Borra la sesión local.

Si el paso 1 falla, sigue igual: el token se borrará cuando otro usuario lo registre en ese teléfono, cuando FCM lo reporte inválido o a los 60 días.

### 7. Recibir pushes y abrir la pantalla correcta

```dart
// Top-level (fuera de cualquier clase), requerido por firebase_messaging.
@pragma('vm:entry-point')
Future<void> onBackgroundMessage(RemoteMessage message) async {}

void setUpPushHandling(GoRouter router) {
  FirebaseMessaging.onBackgroundMessage(onBackgroundMessage);

  // App abierta: el sistema no muestra nada; muestra un banner o una notificación local.
  FirebaseMessaging.onMessage.listen(showInAppBanner);

  // Toque con la app en segundo plano.
  FirebaseMessaging.onMessageOpenedApp.listen((m) => openFromPush(router, m.data));

  // Toque que abrió la app cerrada.
  FirebaseMessaging.instance.getInitialMessage().then((m) {
    if (m != null) openFromPush(router, m.data);
  });
}

void openFromPush(GoRouter router, Map<String, dynamic> data) {
  switch (data['type']) {
    case 'test':
      router.go('/settings/notifications');
    case 'booking.available':
      router.go('/goalkeeper/available/${data['bookingId']}');
    default:
      if ((data['type'] as String?)?.startsWith('request.') ?? false) {
        router.go('/requests/${data['requestId']}');
      } else {
        router.go('/inbox'); // tipo desconocido: registrarlo en los logs de la app
      }
  }
}
```

Las rutas son de ejemplo. Lo que importa es enrutar por `data['type']` y leer los ids de `data`.

### 8. Depuración

- Agrega una acción oculta, por ejemplo en ajustes, que llame `POST /api/devices/test-push`. La respuesta dice cuántos dispositivos se alcanzaron (`reached`), cuántos se borraron por inválidos (`removed`) y cuántos fallaron temporalmente (`failed`).
- `noDevice: true` significa que el teléfono no registró su token: revisa el permiso, la clave de APNs y que se llame `POST /api/devices` tras el login.

## Qué registra el backend

Logs estructurados, siempre con `tokenRef`, nunca con el token:
- `device_registered`, `device_refreshed`, `device_transferred` (con `previousUserId`);
- `device_unregistered`;
- `device_removed`, con `reason: 'invalid' | 'limit'`;
- `push_send_failed`, `push_send_fatal`, `push_message_invalid`, `push_notifier_failed`;
- `push_sent` (solo en modo `log`).

Los dispositivos que vencen por el TTL los borra MongoDB, sin log por dispositivo.
