# Quickstart: Device Registration for Push Notifications

**Feature**: `014-fcm-device-registration` | **Spec**: [spec.md](./spec.md) | **Contract**: [contracts/devices-endpoints.md](./contracts/devices-endpoints.md)

Sections 3 and 5 become the permanent guide `docs/push-notifications.md` (FR-018), linked from the README.

## 1. Local, without Firebase (`PUSH_MODE=log`, the default)

```bash
npm run dev
# with an access token from the usual SSO flow:
curl -X POST localhost:3000/api/devices -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"token":"local-test-token","platform":"android"}'   # → 204
curl -X POST localhost:3000/api/devices/test-push -H "Authorization: Bearer $TOKEN"          # → 200 {"reached":1,...}
```

The log shows `push_sent` with a `tokenRef` (never the token). Repeat the test push 6 times within a minute: the 6th answers `429`.

## 2. Local, sending real pushes to a phone (`PUSH_MODE=fcm`)

1. `gcloud auth application-default login` with an account that has **Firebase Cloud Messaging API Admin** on the Firebase project.
2. In `.env`:

   ```text
   PUSH_MODE=fcm
   FIREBASE_PROJECT_ID=<firebase project id>
   ```
3. Start the API and the app on the phone (skill `levanta-la-app`). Sign in, allow notifications, and call `test-push` (or use the app's debug button, if there is one): the push arrives.

## 3. Cloud setup (once per environment)

| Step | Where | Value |
|---|---|---|
| Enable the **Firebase Cloud Messaging API** (`fcm.googleapis.com`) | Google Cloud console → APIs | project of the Firebase app |
| Grant the backend's service account `roles/firebasecloudmessaging.admin` | IAM | the App Hosting / Cloud Run runtime service account |
| Upload the **APNs authentication key** (.p8), with its Key ID and Team ID | Firebase console → Project settings → Cloud Messaging → Apple app configuration | one key covers development and production |
| Set `PUSH_MODE=fcm` and `FIREBASE_PROJECT_ID` | App Hosting environment variables (`apphosting.yaml`) | |
| Optional: `PUSH_DEVICE_INACTIVITY_DAYS`, `PUSH_MAX_DEVICES_PER_USER`, `PUSH_TEST_LIMIT_PER_MINUTE` | same | defaults 60 / 10 / 5 |

No key file is created: the service account's own identity signs the calls.

## 4. Manual checks (add to `_temp_pruebas.md`, deferred to the end of the roadmap)

1. **Register and refresh**: register token T as user A twice. In `devices` there is 1 document with `userId = A` and a newer `lastSeenAt`.
2. **Transfer**: register T as user B. The document now has `userId = B`, and its `createdAt` is unchanged.
3. **Unregister**:
   - as A, unregister T: 204, and the document still belongs to B;
   - as B, unregister T: 204, and the document is gone.
4. **Real device, iOS and Android**: sign in, allow notifications, test push:
   - app in the foreground: shown by the app;
   - app in the background: system notification, and a tap opens the app;
   - app closed: system notification, and a tap opens the app through `getInitialMessage`.
5. **Invalid token**: uninstall the app from one phone, then test push. The answer shows `removed: 1`, and the document is gone.
6. **Credentials failure**: remove the IAM role temporarily, then test push. `failed` counts every device, the log shows `push_send_fatal`, and no document is removed.
7. **TTL**: in the development database, set a device's `lastSeenAt` to 61 days ago. Within about 2 minutes it is gone.
8. **Logs**: search the logs for a full token. There are 0 matches.

## 5. Flutter guide (outline of `docs/push-notifications.md`)

1. **Packages**: `firebase_core`, `firebase_messaging` (and `flutter_local_notifications` to show pushes in the foreground on Android). Run `flutterfire configure` for `firebase_options.dart`.
2. **iOS**:
   - Xcode → Signing & Capabilities: add **Push Notifications**, and **Background Modes → Remote notifications**;
   - the APNs key must be uploaded in Firebase (§3);
   - test on a real device: the simulator only receives pushes on Apple-silicon Macs with iOS 16+.
3. **Android**:
   - Android 13+ needs `POST_NOTIFICATIONS`, requested at runtime (`requestPermission()` does it);
   - create the `default` notification channel (research §12) on start.
4. **Permission**:
   - ask after sign-in, with a short in-app explanation first ("to tell you when there are matches or when your goalkeeper is confirmed");
   - if denied, keep working, because the in-app inbox (015) shows everything;
   - offer a "turn on notifications" shortcut to the system settings later.
5. **Register**:
   - after sign-in, `getToken()` → `POST /api/devices` with `platform` from `Platform.isIOS`;
   - on iOS, wait for `getAPNSToken()` to be non-null before `getToken()`;
   - repeat on every app start with a session, and inside `onTokenRefresh.listen(...)`;
   - failures are retried on the next start and never block the UI.
6. **Sign-out**: `POST /api/devices/unregister` with the current token (refresh the session first if needed), then `deleteToken()`, then clear the session.
7. **Receiving**:
   - `FirebaseMessaging.onMessage`: the app is in the foreground. Show an in-app banner or a local notification.
   - `onMessageOpenedApp`: a tap while in the background.
   - `getInitialMessage()` on start: a tap that launched a closed app.
   - The last two route by `data['type']` plus the ids (contract, "Push data convention"). An unknown type → home or inbox.
   - Register the background handler (`onBackgroundMessage`) as a top-level function, even if it does nothing yet.
8. **Debug**: add a hidden "send test push" action calling `POST /api/devices/test-push`.
