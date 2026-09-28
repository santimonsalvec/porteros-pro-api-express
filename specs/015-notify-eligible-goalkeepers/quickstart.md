# Quickstart: Notify Eligible Goalkeepers of Available Matches

**Feature**: `015-notify-eligible-goalkeepers` | **Contract**: [contracts/notifications-and-offers.md](./contracts/notifications-and-offers.md)

It works locally with no cloud: `EVENTS_MODE=local` delivers `booking.created` in-process, a 60 s timer runs the sweep (and its reminder job), and `PUSH_MODE=log` logs pushes.

## 1. First notification

1. Goalkeeper G: active, zone Bello enabled, balance ≥ commission, switch on. `$TG` is G's token.
2. Client C (`$TC`) quotes and confirms a 2-goalkeeper match in Bello.
3. Expected:
   - the log shows `offers_notified` with `created: 1` and `push_sent` for G (once, even though there are 2 bookings);
   - `GET /api/notifications` with `$TG` returns 1 item, `type: booking.available`, `stillAvailable: true` and `unreadCount: 1`.

## 2. Reminders

1. Leave the offer unread. Over the next ~20 minutes, the log shows `offer_round` with pushes to G at ≥ 5-minute intervals, exactly 3 times, then none.
2. With a second open match for G, the reminder body is `Hay 2 partidos disponibles en tus zonas`.
3. `POST /api/notifications/{id}/read` (or `/dismiss`): no more reminders for that offer.

## 3. The switch

1. `PUT /api/goalkeepers/me/offers-availability {"available": false}` with `$TG`:
   - `GET /api/goalkeepers/me/available-bookings` gives `items: []` and `unavailableReason: "not_available_for_offers"`;
   - accepting a pending booking gives `409 goalkeeper_not_available`;
   - a new match confirmed by C gives G nothing.
2. `{"available": true}`: the answer has `offersSent ≥ 1` (the match from step 1.3), the log shows `push_sent` right away, and a round within 5 minutes sends G nothing.

## 4. Manual checks (add to `_temp_pruebas.md` §9, deferred to the end of the roadmap)

- Non-eligible goalkeepers get nothing: suspended, short of funds, clashing, own request, other zone, switch off.
- 2-goalkeeper request: 1 offer per goalkeeper.
- Reminder cap of 3, and the ≥ 5-minute spacing.
- Grouped reminder text.
- Read and dismiss stop reminders.
- The switch: off hides the list and refuses acceptance; on sends the offers immediately.
- Real devices (after 014's setup): tapping the push opens the match (`booking.available`) or the list (`bookings.available`).
