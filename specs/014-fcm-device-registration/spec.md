# Feature Specification: Device Registration for Push Notifications ✅

**Feature Branch**: `014-fcm-device-registration`
**Created**: 2026-09-28
**Status**: ✅ Implemented — merged into `main` on 2026-09-28. Manual checks deferred to the end of the roadmap (`_temp_pruebas.md`).
**Input**: User description: "Spec 014 de _temp_plan.md" — "Registro de dispositivos para notificaciones push con Firebase Cloud Messaging, para clientes y porteros. Requisitos: (1) Endpoint autenticado para registrar o actualizar el token FCM del dispositivo (token, plataforma ios/android). Un usuario puede tener varios dispositivos; un token pertenece a un solo usuario (si otro usuario inicia sesión en el mismo teléfono, el token pasa a él). Registrar el mismo token varias veces es idempotente y actualiza su último uso. (2) Endpoint para eliminar el token al cerrar sesión. (3) El backend puede obtener los tokens vigentes de un conjunto de usuarios y eliminar los que FCM reporte como inválidos; los tokens sin uso por mucho tiempo se eliminan solos. (4) Documentar el lado Flutter: permisos, obtención del token tras el login, reenvío en onTokenRefresh, borrado al cerrar sesión, clave APNs en Firebase y capacidad Push Notifications en iOS, y manejo de onMessage / onMessageOpenedApp / getInitialMessage para abrir la pantalla correcta."

**Context**: Step 014 of the goalkeeper-guarantee roadmap (repository-root `_temp_plan.md`, section 4.4). It has no dependency on earlier roadmap steps. The features that notify people depend on it:
- 015 pushes available matches to eligible goalkeepers, and re-sends every 5 minutes;
- 019 pushes changes on a client's requests to that client.

Both of them need to know, for a set of users, which devices to reach, and need the platform to forget devices that can no longer be reached.

## Clarifications

### Session 2026-09-28

- Q: Does 014 include actually sending pushes (the real push-service integration), or only the token registry? → A: It includes sending: a replaceable sender with the real push-service adapter, sending to a set of users, removing invalid tokens and a per-user result. 015 and 019 only choose recipients and compose the text.
- Q: Who may request a test push (Story 6)? → A: Any signed-in user (client, goalkeeper or administrator), only to their own devices, limited per minute. No administrator can target another user's devices.
- Q: After how many days unseen is a device removed automatically? → A: 60 days (configurable). Longer than Firebase's ~30-day suggestion, so goalkeepers who rarely open the app are not silently lost; invalid tokens are still removed on the first failed send.

## User Scenarios & Testing *(mandatory)*

The users are **clients** and **goalkeepers** using the mobile app on iOS or Android. They never see a "register device" screen: the app registers the phone in the background after they sign in and accept notifications. Their visible benefit comes in 015 and 019, when pushes start arriving on the right phone, and only on the right phone.

### User Story 1 - A signed-in phone can receive notifications (Priority: P1)

After a user signs in and allows notifications, the app sends the platform the phone's **push address** (a device token issued by the push service) and whether the phone is iOS or Android. The platform remembers that this device belongs to this user. A user can have several devices (a phone and a tablet, an old and a new phone), and each one is remembered separately. The app sends the address again every time it opens and whenever the push service issues a new one; repeating it changes nothing except the record of when the device was last seen.

**Why this priority**: Without knowing a user's devices, no push can reach them. It is the foundation of every notification in the roadmap.

**Independent Test**: Sign in as a goalkeeper and register a token from an Android phone. Register it again: there is still one device, with an updated "last seen". Register a second token from an iPhone: the goalkeeper now has two devices. Ask the platform for the goalkeeper's devices: both are returned.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** the app registers a new token with its platform, **Then** the device is stored for that user and the call succeeds.
2. **Given** a token already registered for the same user, **When** it is registered again, **Then** no second device is created and its "last seen" time is updated.
3. **Given** a user with a registered device, **When** a second token is registered, **Then** the user has two devices.
4. **Given** the push service issued a new token for a phone, **When** the app registers the new one, **Then** it is stored for the user. The old token is forgotten when the push service later reports it as invalid, or when it goes stale (Story 4).
5. **Given** a request without a valid session, or with a missing, empty, oversized token or an unknown platform, **Then** it is refused and nothing is stored.

---

### User Story 2 - A shared phone notifies only the person signed in (Priority: P1)

A phone can change hands: a client signs out and a goalkeeper signs in on the same phone, or someone signs in with a different account. A device token belongs to **one user at a time**. When a different user registers a token that already belongs to someone else, the device moves to the new user, and the previous user stops getting pushes on that phone.

When a user signs out, the app asks the platform to forget the phone's token first, so nothing addressed to them arrives on a phone they no longer use.

**Why this priority**: A push sent to the wrong person leaks private data. Pushes carry match details, and later the other party's name and WhatsApp (roadmap §2.10).

**Independent Test**: Register a token for user A. Register the same token for user B: the token now belongs only to B, and A's device list no longer includes it. Then, as B, remove the token: B no longer has it, and nobody does.

**Acceptance Scenarios**:

1. **Given** a token registered for user A, **When** user B registers the same token, **Then** the token belongs only to B, and A's devices no longer include it.
2. **Given** a signed-in user with a registered token, **When** they sign out and the app removes the token, **Then** the token is no longer stored for anyone.
3. **Given** the token to remove is not registered, or is registered to a different user, **When** a user asks to remove it, **Then** the call succeeds with no effect, and another user's device is never removed nor revealed.
4. **Given** the same removal is repeated, **Then** each call succeeds and the result is the same.

---

### User Story 3 - The platform reaches a set of users and drops dead devices (Priority: P1)

Later features must be able to send one push to a set of users (for example, every eligible goalkeeper for a match) without dealing with devices themselves. The platform finds the current devices of those users and sends the push to each device. When the push service answers that a token is **no longer valid** (the app was uninstalled, the token expired or was replaced), the platform forgets that token right away, so it is not tried again. A temporary push-service failure does not remove anything.

**Why this priority**: 015 and 019 need this to work from day one. Dead tokens pile up quickly: every reinstall or token rotation leaves one behind, and trying them wastes the push budget and time.

**Independent Test**: Give user A two devices and user B one. Ask to push to A and B: three sends are attempted, one per device. Make the push service report one of A's tokens as invalid and another send fail temporarily: the invalid token is removed, the temporarily failed one is kept, and the result reports how many devices were reached.

**Acceptance Scenarios**:

1. **Given** a set of users, **When** the platform looks up their devices, **Then** it gets every stored token of each of those users, and only theirs.
2. **Given** users without any device, **When** a push is sent to them, **Then** nothing is sent to them, it is not an error, and the result says they had no device.
3. **Given** the push service reports a token as invalid or unregistered, **Then** that token is removed.
4. **Given** the push service fails temporarily (unavailable, quota, timeout), **Then** the token is kept and the failure is logged.
5. **Given** a push to several users, **Then** the result reports, per user, how many devices were reached, how many were removed as invalid, and how many failed temporarily.

---

### User Story 4 - Abandoned devices disappear by themselves (Priority: P2)

Some devices stop being used without saying so: a phone is lost, sold or reset. Its token stays stored but never again reaches anyone. Any device that has not been seen (registered, or re-registered on app open) for a long time — **60 days** by default — is removed automatically.

**Why this priority**: The invalid-token removal of Story 3 catches most dead tokens, but only when a push is attempted. This keeps the device list small and accurate without manual work.

**Independent Test**: Store a device last seen 61 days ago and another last seen yesterday. After the automatic cleanup runs, the first is gone and the second remains.

**Acceptance Scenarios**:

1. **Given** a device not seen for longer than the inactivity period, **When** the automatic cleanup runs, **Then** it is removed.
2. **Given** a device seen within the inactivity period, **Then** it is kept.
3. **Given** a stale device that is registered again before the cleanup runs, **Then** its "last seen" is renewed and it is kept.

---

### User Story 5 - The mobile team knows exactly how to wire the app (Priority: P2)

The mobile team has a written guide for the Flutter app. It covers:
- asking for notification permission, and what to do when it is denied;
- getting the token after sign-in, and registering it with the platform;
- registering it again on every app open and whenever the push service issues a new token;
- removing it before signing out;
- iOS setup: the Apple push key uploaded to Firebase, and the Push Notifications capability and background mode enabled in the app;
- Android setup, including the notification permission on recent Android versions;
- handling a push when the app is open, when the user taps it with the app in the background, and when the tap opens a closed app, so that the right screen opens.

**Why this priority**: The backend alone delivers nothing: without the app side, no token is ever registered. The guide is what makes this feature usable, but it doesn't block the backend work.

**Independent Test**: A developer who has not worked on this feature follows the guide on a real iPhone and a real Android phone. Both register a token after sign-in, a test push reaches both, and tapping it opens the screen named in its data.

**Acceptance Scenarios**:

1. **Given** the guide, **When** a developer follows it, **Then** the app registers the phone's token after sign-in on both iOS and Android.
2. **Given** a push that names a screen in its data, **When** it arrives with the app in the foreground, in the background, or closed, **Then** the guide explains how the app shows it and opens that screen when tapped.
3. **Given** the user denies notification permission, **Then** the guide explains how the app keeps working without pushes (the in-app inbox from 015 still shows everything) and how to invite the user to enable them later.

---

### User Story 6 - A signed-in user can check that pushes reach their phone (Priority: P3)

A signed-in user (in practice, a developer or tester) can ask the platform to send a **test push** to all of their own devices. It lets the mobile team verify the whole chain, from permissions and token registration to delivery and the tap opening a screen, before 015 and 019 exist. It only ever reaches the caller's own devices.

**Why this priority**: Without it, the first real push can only be tested through a full booking flow in 015. It is a small verification tool, not a user-facing feature.

**Independent Test**: As a signed-in user with two devices, ask for a test push: both devices receive it, and the answer reports 2 devices reached. As a user with no devices, ask for a test push: the answer says there is no device to reach.

**Acceptance Scenarios**:

1. **Given** a signed-in user with registered devices, **When** they ask for a test push, **Then** it is sent to each of their devices and the answer reports the per-device result (Story 3, scenario 5).
2. **Given** a signed-in user with no device, **Then** the answer says no device was reached.
3. **Given** a user repeatedly asking for test pushes, **Then** at most a few are sent per minute (default 5) and further requests are refused until the limit resets.

---

### Edge Cases

- **Two users register the same token at the same moment**: exactly one ends up owning it (the last registration wins), and it is never stored twice.
- **The same user registers the same token many times at once** (app open plus token refresh): one device remains.
- **A user signs out with an expired session**: the app refreshes the session first. If it can't (the user was away too long), the token stays until another user registers it on that phone, the push service reports it invalid, or it goes stale.
- **A phone is reinstalled**: it gets a new token and registers it; the old one is removed when the push service reports it invalid, or after the inactivity period.
- **A user has many devices**: at most 10 are kept per user. Registering an 11th removes that user's least recently seen device.
- **The push service rejects the whole request** (bad credentials, service down): no token is removed, the failure is logged, and the caller gets a failed result. It never makes the calling operation (for example, a booking confirmation in later features) fail.
- **A user without a completed profile** (right after first sign-in): they can register a device. Registration happens right after sign-in, before profile completion.
- **An administrator**: is a user like any other for this feature.
- **An account is deleted in the future**: its devices must be removed with it (noted for whenever account deletion exists; not built here).

## Requirements *(mandatory)*

### Functional Requirements

**Registering (Story 1)**

- **FR-001**: A signed-in user MUST be able to register a device by sending its push token and its platform (`ios` or `android`). No completed profile is required.
- **FR-002**: A user MAY have several devices. Each registered token MUST be stored with: its owner, its platform, when it was first registered, and when it was last seen.
- **FR-003**: Registering a token the same user already has MUST be idempotent: it MUST NOT create a second device, and MUST update its "last seen" time and its platform.
- **FR-004**: The token MUST be a non-empty text of at most 4,096 characters, and the platform one of `ios` or `android`. Anything else MUST be refused with a validation error, and nothing is stored.
- **FR-005**: At most 10 devices MUST be kept per user. Registering one more MUST remove that user's least recently seen device.

**Ownership and sign-out (Story 2)**

- **FR-006**: A token MUST belong to at most one user. When a user registers a token that another user owns, the token MUST move to the new user, in a single step, so there is no moment where both own it and it is never stored twice.
- **FR-007**: A signed-in user MUST be able to remove one of their tokens, for use before signing out.
- **FR-008**: Removing a token that isn't registered, or that belongs to another user, MUST succeed without effect and MUST NOT reveal whether the token exists or who owns it. Removal MUST be idempotent.
- **FR-009**: A user MUST NOT be able to list, read or remove another user's devices through any endpoint.

**Reaching users (Story 3)**

- **FR-010**: Other features MUST be able to get the stored tokens (with platform) of a set of users in one lookup.
- **FR-011**: Other features MUST be able to send one push (a title, a body and a small set of key/value data for the app) to a set of users. The platform sends it to each of those users' devices.
- **FR-012**: When the push service reports a token as invalid or no longer registered, the platform MUST remove that token right away.
- **FR-013**: A temporary push-service failure (unavailable, quota exceeded, timeout, internal error) MUST NOT remove the token. It MUST be logged with the user id and the reason, never with the full token.
- **FR-014**: Sending MUST report, per user: devices reached, devices removed as invalid, and devices that failed temporarily. A user with no device is reported as such and is not an error.
- **FR-015**: A push failure MUST never throw into the calling feature: the send always returns a result.
- **FR-016**: Automated tests MUST NOT use the real push service. The sender MUST be replaceable by a test double.

**Automatic cleanup (Story 4)**

- **FR-017**: A device not seen for longer than the inactivity period (default 60 days) MUST be removed automatically, without any manual action.

**Mobile guide (Story 5)**

- **FR-018**: A written guide MUST explain, for the Flutter app:
  - the Firebase project setup, the Apple push key, and the iOS capabilities (Push Notifications, background remote notifications);
  - asking for permission on iOS and on recent Android versions, and behaving well when it is denied;
  - getting and registering the token after sign-in, again on every app open, and on every token refresh;
  - removing the token before signing out;
  - receiving pushes in the foreground, background and closed states, and opening the screen named in the push data when tapped.
- **FR-019**: The guide MUST define the push data convention the app relies on to open a screen (a screen or type key plus the ids it needs). Features 015 and 019 MUST follow it.

**Test push (Story 6)**

- **FR-020**: Any signed-in user (client, goalkeeper or administrator) MUST be able to request a test push to their own devices only, and get back the per-device result of FR-014. No one, administrators included, can target another user's devices.
- **FR-021**: Test pushes MUST be limited per user (default 5 per minute). Requests beyond the limit MUST be refused with a "too many requests" error.

**Privacy and records**

- **FR-022**: Tokens MUST NOT be written to logs or audit records in full (at most a short, non-reversible fingerprint).
- **FR-023**: Registration, removal, ownership transfer, removal as invalid and removal over the per-user limit MUST be logged with the user id and the platform, for support. Automatic removal of stale devices (FR-017) is not logged per device.

### Key Entities

- **Device (push registration)**: one phone or tablet that can receive pushes for one user. Holds:
  - the push token (unique across all users);
  - the owner user id;
  - the platform (`ios` or `android`);
  - when it was first registered and when it was last seen.

  It is created or refreshed when the app registers, moves to another user when that user registers the same token, and is removed on sign-out, when the push service reports it invalid, or after 60 days unseen.
- **Push message**: what later features ask to send: a title, a body, and a small key/value data map telling the app which screen to open. It is not stored by this feature (the inbox that stores notifications comes in 015).
- **Send result**: per user, the count of devices reached, removed as invalid, and failed temporarily.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user who signs in and allows notifications on a phone has that phone registered within 5 seconds, and a test push reaches it within 10 seconds of being requested.
- **SC-002**: 0 pushes reach a user's former phone after another user signs in on it, or after they sign out with a valid session. Verified by registering the same token for two users in turn, and by removal on sign-out.
- **SC-003**: Registering the same token 20 times, including 20 simultaneous registrations, leaves exactly 1 device. 20 simultaneous registrations of one token by 2 different users leave it owned by exactly 1 of them.
- **SC-004**: 100% of tokens the push service reports as invalid are removed after the first failed send, and 0 tokens are removed because of temporary push-service failures.
- **SC-005**: 100% of devices unseen for more than 60 days are gone within 1 day after crossing the limit.
- **SC-006**: A send to 50 users with up to 3 devices each returns its full result within 5 seconds.
- **SC-007**: A developer new to the feature, following only the guide, gets a test push to open the right screen on both an iPhone and an Android phone within one working session.
- **SC-008**: No log or audit record contains a full device token.

## Assumptions

- **Platform choices** (roadmap §4.4, already decided by the owner):
  - the push service is Firebase Cloud Messaging, sending **per device token** (no topics);
  - the backend sends with the service's own Google identity (the Cloud Run service account), so no key file is stored;
  - the app is the existing Flutter app, on iOS and Android only. Web push is out of scope.
- **Who registers**: any signed-in user (client, goalkeeper or administrator), with or without a completed profile. The same phone can be registered by one person at a time.
- **Sign-out is app-side**: sessions are not revoked server-side today. "Removing the token" is the only server call on sign-out, and the app makes it before discarding the session.
- **Re-registration on app open** keeps the "last seen" time fresh, so the 60-day inactivity period only catches phones nobody uses. Firebase recommends treating tokens unseen for about a month as stale; 60 days is chosen to avoid silently losing goalkeepers who open the app rarely.
- **Defaults** (configuration, not code constants):
  - inactivity period before automatic removal: 60 days;
  - maximum devices per user: 10;
  - test pushes per user: 5 per minute.
- **Sending is included** (clarified 2026-09-28): the real push-service adapter ships in this feature, as the roadmap puts the Firebase integration here (§4.4) and removing invalid tokens (requirement 3) only happens when sending. 015 and 019 only compose messages and choose recipients.
- **Out of scope**:
  - the notification inbox and its endpoints (015);
  - deciding who gets notified, and the text of real notifications (015, 019);
  - notification preferences or quiet hours;
  - building the Flutter screens (this feature delivers the guide; the app work follows the backend plan, `_temp_plan.md` §8.1).
- **Technical decisions left to the plan**: how the automatic cleanup runs (a storage-level expiry or a scheduled job from feature 013); how the push-service errors are classified into "invalid" and "temporary"; the batching of sends; and the exact endpoint paths.
