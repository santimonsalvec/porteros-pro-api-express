# Quickstart: Client Request Notices

**Feature**: `019-client-request-notices` | **Contract**: [contracts/client-notices.md](./contracts/client-notices.md)

Run it locally with `EVENTS_MODE=local` and `PUSH_MODE=log`. `$TC` is the client's token, and `$TG` / `$TH` belong to two goalkeepers of the zone.

## 1. First goalkeeper of two

C books 2 goalkeepers for tomorrow, and G accepts one booking.

**Expected**:
- C's inbox has `booking.goalkeeper_assigned` ("Un portero tomó tu partido … Seguimos buscando el otro."), with no name, and the log shows `push_sent` to C;
- `GET /goalkeeper-requests/bookings` shows the booking `assigned` with `goalkeeper: null` and `contactsVisibleFrom` = start − 60 min;
- G's agenda shows the match with `client: null` and `clientContactVisibleFrom`.

## 2. Complete

H accepts the other booking.

**Expected**: C gets exactly one `request.complete` ("¡Listo! Tus 2 porteros están confirmados … Verás sus datos 1 hora antes.") and no second `booking.goalkeeper_assigned`.

## 3. One hour before

Move the clock to start − 60 min and run the sweep (`POST /internal/sweep` locally).

**Expected**:
- C gets one `request.contacts_visible` with both names and WhatsApp;
- G and H each get one `booking.client_contact_visible` with C's;
- both views now show the contacts;
- running the sweep again sends nothing.

## 4. Late acceptance

Book a match starting in 50 minutes, and G accepts.

**Expected**:
- C's `request.complete` already names G with the WhatsApp, and G's acceptance answer shows C's contact;
- no `*contact_visible` notice follows.

## 5. Manual checks (add to `_temp_pruebas.md` §13, deferred to the end of the roadmap)

- §1–§4 against the dev cluster, with pushes on real devices.
- A replacement taken after a withdrawal (018) → "Encontramos otro portero…", then a new `request.complete`.
- The app routes each `type` to the right screen.
