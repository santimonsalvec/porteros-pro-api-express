# Quickstart: Goalkeeper Check-in with Photo

**Feature**: `020-goalkeeper-check-in` | **Contract**: [contracts/check-in.md](./contracts/check-in.md)

Run it locally with `EVENTS_MODE=local` and `PUSH_MODE=log`. `$TG` is the goalkeeper's token and `$TC` the client's. G holds booking `$B` of a match at `$START`.

## 1. Reminder

Move the clock to `$START − 30 min` and run `POST /internal/sweep`.

**Expected**: G's inbox has `booking.check_in_open`, and the log shows `push_sent` to G.

## 2. Check in

```bash
IMG=$(curl -s -X POST "$API/images" -H "Authorization: Bearer $TG" -F image=@foto.jpg | jq -r .id)
curl -s -X POST "$API/goalkeepers/me/bookings/$B/check-in" -H "Authorization: Bearer $TG" -H "$H" \
  -d "{\"imageId\":\"$IMG\",\"location\":{\"latitude\":3.4516,\"longitude\":-76.532}}" | jq .checkIn
```

**Expected**:
- `checkIn.at`, `photoUrl` and `distanceMeters`;
- C's request shows `checkIn: { at, photoUrl }` with no location;
- C's inbox has `booking.goalkeeper_arrived`;
- repeating the call answers the same.

## 3. Too early, too late

A check-in at `$START − 31 min` gives `409 check_in_not_open`, and at `$START + 16 min` gives `409 check_in_closed`.

## 4. No check-in

Another booking without a check-in:
- at `$START + 5 min`, G gets `booking.check_in_last_call`;
- at `$START + 15 min`, the sweep sends C `booking.check_in_missed` with G's WhatsApp;
- running the sweep again sends nothing.

## 5. Manual checks (add to `_temp_pruebas.md` §14, deferred to the end of the roadmap)

- §1–§4 against the dev cluster, with real photos and pushes on devices.
- Location permission denied → the check-in still works, with no distance.
- The client sees the photo in the app.
