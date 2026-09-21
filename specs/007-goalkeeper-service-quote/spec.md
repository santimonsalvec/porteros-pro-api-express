# Feature Specification: Goalkeeper Service Quote

**Feature Branch**: `007-goalkeeper-service-quote`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "Endpoint de cotización de servicio de porteros: calcular el costo total de la renta de porteros a partir de la ubicación (latitud/longitud), la fecha y hora del partido (en intervalos exactos de 30 minutos, dentro de una ventana de días futuros configurable en base de datos con valor por defecto de 2 días), la cantidad de porteros (1 o 2) y la duración (60, 90 o 120 minutos). La tarifa base se determina por zona (prioridad 1) o, si la zona no tiene precio para esa duración, por ciudad (fallback), y se multiplica por la cantidad de porteros. Se suma un recargo por anticipación (menos de 60 min: 10.000 COP; 60–119 min: 5.000 COP; 120 min o más: 0 COP) cuyos rangos y valores se configuran en base de datos. Ubicaciones fuera de cobertura se rechazan. La respuesta devuelve el desglose: subtotal por porteros, recargo, total y moneda."

## Clarifications

### Session 2026-09-20

- Q: Should the quote enforce a minimum notice before the match starts? → A: Yes. A match cannot be requested with less than 30 minutes of notice; the request is refused with a reason stating there is not enough time for a goalkeeper to reach the zone. The 30 minutes is the value for the current market; it is a stored setting resolved per country like the other booking rules (see below), with no built-in default.
- Q: How should a start time without a time-zone offset be handled, given the service will open in cities around the world? → A: Time zone is a property of each city. The match time is the local wall-clock time at the pitch's city: an offset-less start time is read in that city's time zone, a start time with an offset is converted to the same instant, and "today", the booking window and the 30-minute marks are all evaluated in that city's local time. No single service-wide time zone exists.
- Q: At what level are the surcharge tiers, booking window and minimum notice configured, given the service will open in other countries? → A: Per country. Cities inherit their country's configuration, and a city may define its own values, which take precedence for that city. If neither the city nor its country has the configuration, the quote cannot be given and is refused. This removes the built-in defaults (2 days, 30 minutes, COP surcharge tiers) from the original description: nothing is assumed when configuration is missing.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Get the total price for a goalkeeper booking (Priority: P1)

A client who is planning an amateur match picks the field location, the match date and start time, how many goalkeepers they need (1 or 2) and how long they need them (60, 90 or 120 minutes). They ask for a quote and receive the full price breakdown — the goalkeeper subtotal, any last-minute surcharge, the final total and the currency — before committing to anything.

**Why this priority**: This is the whole feature. A client cannot decide whether to request goalkeepers without seeing the exact price, and every later step of the booking flow relies on this number being right.

**Independent Test**: Can be fully tested by requesting a quote for a location inside a covered zone that has its own rate, a valid 30-minute-aligned start time within the allowed window, and a valid quantity/duration, then confirming the returned subtotal, surcharge, total and currency match the pricing rules exactly.

**Acceptance Scenarios**:

1. **Given** a covered zone with a 60-minute rate of 40.000 COP, **When** a client quotes 1 goalkeeper for 60 minutes starting at least 120 minutes from now, **Then** the quote shows a goalkeeper subtotal of 40.000 COP, a surcharge of 0 COP, a total of 40.000 COP and the currency COP.
2. **Given** the same zone and duration, **When** a client quotes 2 goalkeepers, **Then** the goalkeeper subtotal is exactly twice the single-goalkeeper rate, and the total is that subtotal plus the applicable surcharge.
3. **Given** a covered zone with rates of 40.000 / 55.000 / 70.000 COP for 60 / 90 / 120 minutes, **When** a client quotes each of the three durations, **Then** each quote uses the rate that corresponds to its own duration.
4. **Given** a match starting 45 minutes from now, **When** a client requests a quote, **Then** the quote includes the highest last-minute surcharge (10.000 COP in the Colombian configuration) and the total equals the goalkeeper subtotal plus that surcharge.
5. **Given** a match starting 90 minutes from now, **When** a client requests a quote, **Then** the quote includes the middle surcharge (5.000 COP in the Colombian configuration).
6. **Given** a match starting exactly 120 minutes from now, **When** a client requests a quote, **Then** the surcharge is 0 COP.
7. **Given** two covered cities in different time zones, **When** a client sends the same offset-less start time (for example 15:00 tomorrow) for a location in each, **Then** each is read as 15:00 in its own city's local time, and the minimum-notice check, the booking window and the surcharge tier reflect the real instant of each.
8. **Given** a start time sent with an explicit offset, **When** a client requests a quote, **Then** it is converted to the same real instant, and the quote returns the resolved instant and the city's time-zone identifier so the app can show the match time in the city's local time.

---

### User Story 2 - Fall back to the city rate when the zone has no price (Priority: P1)

When the location falls in a zone that has no rate configured for the chosen duration, the client still gets a price: the city's base rate for that duration is used instead. The zone rate always wins when one exists.

**Why this priority**: Zones will often not have their own pricing. Without the fallback most locations would be unquotable, which defeats the feature.

**Independent Test**: Can be fully tested by quoting a location in a zone with no rate for the chosen duration (while its city has one) and confirming the city's rate is applied; then quoting in a zone that does have its own rate and confirming the zone rate is applied instead of the city's.

**Acceptance Scenarios**:

1. **Given** a zone with no rate for 90 minutes and a city rate of 55.000 COP for 90 minutes, **When** a client quotes 90 minutes at a location in that zone, **Then** the city rate of 55.000 COP is used per goalkeeper.
2. **Given** a zone and its city both have a rate for the chosen duration, **When** a client quotes at a location in that zone, **Then** the zone rate is used, not the city rate.
3. **Given** a zone that has a rate for 60 minutes but not for 120 minutes, **When** a client quotes 120 minutes there, **Then** the city's 120-minute rate is used (the fallback is decided per duration, not per zone as a whole).
4. **Given** neither the zone nor its city has a rate for the chosen duration, **When** a client requests a quote, **Then** the quote is refused with a clear reason stating that no price is available for that duration in that area, and no price is shown.

---

### User Story 3 - Refuse quotes that break the booking rules (Priority: P1)

The client is told immediately, and clearly, when the request cannot be quoted: the location is outside every service zone, the start time is in the past, less than 30 minutes away, too far ahead, or not on a 30-minute mark, or the quantity or duration is not one of the allowed values.

**Why this priority**: A quote for a booking that could never be made is misleading. Clear refusals keep clients from planning around impossible bookings and give the app precise messages to show.

**Independent Test**: Can be fully tested by submitting one invalid request per rule (each with only that one defect) and confirming each is refused with a distinct, identifiable reason and that no price is returned.

**Acceptance Scenarios**:

1. **Given** coordinates that fall outside every active service zone, **When** a client requests a quote, **Then** the request is refused as "location not covered" and no price is returned.
2. **Given** a start time earlier than the moment of the request, **When** a client requests a quote, **Then** the request is refused.
3. **Given** a start time less than 30 minutes after the moment of the request (for example 20 minutes away), **When** a client requests a quote, **Then** the request is refused with a reason stating that there is not enough time for a goalkeeper to reach the zone, and no price is returned.
4. **Given** a start time exactly 30 minutes after the moment of the request, **When** a client requests a quote, **Then** the quote is returned (30 minutes is the earliest acceptable notice).
5. **Given** a start time beyond the last allowed booking day, **When** a client requests a quote, **Then** the request is refused.
6. **Given** a start time that is not exactly on a 30-minute mark (for example 14:15 or 14:30:30), **When** a client requests a quote, **Then** the request is refused.
7. **Given** a quantity of 0 or 3, or a duration of 45 or 150 minutes, **When** a client requests a quote, **Then** the request is refused.
8. **Given** a request missing any of the five required inputs, or with coordinates that are not real latitude/longitude values, **When** a client requests a quote, **Then** the request is refused and the reason identifies the offending input.

---

### User Story 4 - Configure booking rules per country, with city overrides (Priority: P2)

The business defines, per country, how many days ahead clients may book, the minimum notice, and the surcharge tiers (time ranges and amounts) by updating stored settings — no software release is needed. Every city in a country inherits that country's values, and a city may define its own values, which take precedence for that city only. If neither the city nor its country has the configuration, the area cannot be quoted.

**Why this priority**: The service will open in other countries with their own currencies and policies, so these values cannot be a single global set. The quote is fully usable in a configured area, so this is secondary to getting correct prices out, but it decides whether a given city can be quoted at all.

**Independent Test**: Can be fully tested by configuring a country's window, minimum notice and tiers, quoting in one of its cities and confirming those values are used; then adding a city override and confirming only that city changes; then removing the configuration at both levels and confirming the quote is refused.

**Acceptance Scenarios**:

1. **Given** neither a city nor its country has a booking window, minimum notice or surcharge configuration, **When** a client requests a quote for a location in that city, **Then** the quote is refused with a reason stating the service is not configured for that area, and no price is returned.
2. **Given** a country configured with a booking window of 2 days, **When** a client quotes for tomorrow in one of its cities, **Then** the quote succeeds; **and When** a client quotes for the day after tomorrow, **Then** it is refused.
3. **Given** the country's booking window is changed to 4 days, **When** a client quotes for a date up to and including three days from today, **Then** the quote succeeds; and a later date is refused.
4. **Given** a country configured with a 30-minute minimum notice, **When** a client quotes a match 29 minutes away, **Then** it is refused; **and When** a client quotes a match 30 minutes away, **Then** it succeeds.
5. **Given** the minimum notice is changed to 45 minutes, **When** a client quotes a match 40 minutes away, **Then** it is refused for insufficient time.
6. **Given** the surcharge for the "less than 60 minutes" tier is changed to 12.000 COP, **When** a client quotes a match 30 minutes away, **Then** the surcharge shown is 12.000 COP.
7. **Given** the boundaries of a surcharge tier are changed (for example the middle tier now runs 60 to 179 minutes), **When** a client quotes a match 150 minutes away, **Then** the middle-tier surcharge applies.
8. **Given** a country has its own configuration and one of its cities defines different values, **When** a client quotes in that city, **Then** the city's values apply; **and When** a client quotes in another city of the same country, **Then** the country's values apply.
9. **Given** two countries configured with different values and currencies, **When** clients quote in a city of each, **Then** each quote uses its own country's configuration and currency, with no values crossing between them.

---

### Edge Cases

- **Tier boundaries** (using the Colombian tier values): A lead time of exactly 60 minutes falls in the 60–119 tier (5.000 COP), not the "less than 60" tier; exactly 120 minutes falls in the "120 or more" tier (0 COP); 59 minutes 59 seconds is still "less than 60".
- **Window boundaries**: With a window of 2 days, a start time at 23:30 tomorrow is allowed and 00:00 the day after tomorrow is not. "Day" means the calendar day in the local time zone of the city where the location is, not a rolling 48 hours; two cities in different time zones therefore roll over to a new day at different real moments.
- **Minimum-notice boundary**: With a 30-minute minimum notice, a start time exactly 30 minutes after the moment of the request is accepted; 29 minutes 59 seconds is refused as insufficient time. Because start times sit on 30-minute marks, a request made at 14:10 cannot start at 14:30 (20 minutes away) and the earliest acceptable start is 15:00.
- **Past slots today**: A slot that began earlier today is in the past and is refused as a past time, not as insufficient notice.
- **Location on the border of two zones, or in overlapping zones**: The quote must still be deterministic — the same coordinates always resolve to the same zone.
- **Inactive zones**: A location that lies only inside a zone marked inactive is treated as not covered.
- **Zone belongs to a satellite city of a larger metro area**: The city rate used for fallback is the one for the city that owns the zone's pricing, consistent with how zones are already grouped by city.
- **Missing rate for a duration**: A missing rate is "not configured" (falls back to the city, or refuses); it is never treated as a free service.
- **No surcharge tier matches the lead time** (for example the tiers were configured with a gap): No surcharge is applied rather than failing the quote.
- **Start time provided without a time-zone offset**: It is read as local time in the city where the location is, never in the client device's time zone, so a client travelling abroad gets the same result as a local one.
- **Start time provided with an offset that differs from the city's**: It is converted to the same real instant and then judged in the city's local time; for example 15:00 at offset −05:00 is 16:00 local in a city at −04:00, which is a valid 30-minute mark, whereas an instant that lands at :15 or :45 local is refused.
- **Daylight-saving changes**: An offset-less local time that does not exist in the city (skipped by a clock going forward) or that occurs twice (repeated by a clock going back) is refused as an invalid start time; the client can resolve the repeated case by sending an explicit offset.
- **City without a configured time zone**: The quote is refused with a reason saying the time zone for that area is not configured, rather than assuming another city's time zone.
- **Configuration missing at both levels**: If neither the city nor its country defines the booking window, the minimum notice or the surcharge tiers, the quote is refused with a reason saying the service is not configured for that area; nothing is assumed and no price is returned.
- **Partial city override**: Each of the three settings (booking window, minimum notice, surcharge tiers) is resolved on its own: a city that overrides only the tiers still inherits its country's window and minimum notice.
- **Surcharge currency mismatch**: If the resolved surcharge tiers are in a different currency than the resolved rate, the quote is refused as not configured for that currency rather than adding amounts in different currencies.
- **City whose country cannot be determined**: Treated like missing configuration at the country level: only a city-level configuration can make it quotable.
- **Quoting is repeated**: Asking twice for the same inputs a few seconds apart gives the same subtotal; the surcharge can legitimately change only if the request crosses a tier boundary in that time.
- **Coordinates that are valid numbers but in the middle of the ocean or another country**: Refused as "location not covered", not as an input-format error.

## Requirements *(mandatory)*

### Functional Requirements

**Inputs and validation**

- **FR-001**: The system MUST accept a quote request containing exactly these inputs, all required: a latitude, a longitude, a match start date-and-time, a number of goalkeepers, and a duration in minutes.
- **FR-002**: The system MUST refuse the request, identifying the offending input, when any input is missing, not of the expected type, or a latitude outside −90..90 or a longitude outside −180..180.
- **FR-003**: The system MUST accept a number of goalkeepers of only 1 or 2, and refuse any other value.
- **FR-004**: The system MUST accept a duration of only 60, 90 or 120 minutes, and refuse any other value.
- **FR-005**: The system MUST accept a start date-and-time with or without a time-zone offset, and MUST accept it only when, expressed in the local time of the city where the location is (FR-022), it falls exactly on a 30-minute mark (local minutes 00 or 30, with no seconds or fractional seconds); otherwise it MUST refuse it. Because the mark is judged in the city's local time, this check happens once the location has been resolved.
- **FR-006**: The system MUST refuse a start time earlier than the moment the request is received ("time in the past"), and MUST refuse a start time that is less than the minimum notice after that moment (the configured minimum notice, FR-008; exactly the minimum is accepted). The minimum-notice refusal MUST state that there is not enough time for a goalkeeper to reach the zone, and MUST be distinguishable from the past-time refusal.
- **FR-007**: The system MUST refuse a start time that falls after the last allowed booking day. The allowed window runs from the current day through the number of days ahead defined by the booking-window setting, counted as calendar days in the local time zone of the city where the location is, where a value of N means "today plus the next N−1 days".
- **FR-008**: The maximum-days value and the minimum-notice value MUST be read from stored settings on each quote, resolved as defined in FR-025, so that changes take effect without a software release. There is no built-in default: when neither the city nor its country defines a value, the quote is refused (FR-025).
- **FR-009**: Invalid-input refusals (FR-002 to FR-005) and business-rule refusals (FR-006, FR-007, FR-010, FR-014, FR-023, FR-025) MUST be distinguishable from each other and each rule MUST have its own identifiable reason, so a client app can show a specific message.

**Location resolution**

- **FR-010**: The system MUST determine which active service zone contains the given coordinates, and from that zone the city it belongs to. If no active zone contains the point, the system MUST refuse the request as "location not covered" (a client error) and return no price.
- **FR-011**: When a point falls within more than one active zone, the system MUST resolve it consistently to a single zone using a fixed, documented tie-break so the same coordinates always produce the same result.

**Pricing**

- **FR-012**: The system MUST determine the unit rate for the requested duration using this priority: (1) the rate configured for the identified zone and that duration; otherwise (2) the rate configured for the zone's city and that duration. The fallback MUST be evaluated separately for each duration.
- **FR-013**: The rate is per goalkeeper. The goalkeeper subtotal MUST equal the unit rate multiplied by the requested number of goalkeepers.
- **FR-014**: When neither the zone nor its city has a rate for the requested duration, the system MUST refuse the request with a reason identifying that no price is configured, and MUST NOT return a price or treat the missing rate as zero.
- **FR-015**: The system MUST compute lead time as the exact time difference between the moment the request is received and the match start time.
- **FR-016**: The system MUST apply exactly one surcharge tier based on lead time. For example, the Colombian configuration is: less than 60 minutes → 10.000 COP; 60 up to and including 119 minutes → 5.000 COP; 120 minutes or more → 0 COP.
- **FR-017**: Surcharge tiers (their lead-time ranges and their amounts, in a stated currency) MUST be read from stored settings, resolved as defined in FR-025, so they can be changed without a software release. There is no built-in default: when neither the city nor its country defines tiers, the quote is refused (FR-025). When tiers are resolved but none matches the lead time, no surcharge is applied. When the resolved tiers' currency differs from the currency of the resolved rate, the quote is refused as not configured.
- **FR-018**: The total MUST equal the goalkeeper subtotal plus the surcharge, in the same currency.

**Response**

- **FR-019**: A successful quote MUST return the breakdown: the unit rate per goalkeeper, the number of goalkeepers, the goalkeeper subtotal, the lead-time surcharge, the total, and the currency (COP for all current pricing), together with the match start as the client should show it: the resolved instant and the city's time zone identifier.
- **FR-020**: Requesting a quote MUST NOT create, reserve, or alter any booking, goalkeeper availability or stored data; it is a read-only calculation.
- **FR-021**: The quote endpoint MUST be available only to authenticated clients, consistent with the rest of the booking flow.

**Time zones**

- **FR-022**: Every city MUST have its own time zone (a standard region-based identifier, e.g. `America/Bogota`), and the quote MUST use the time zone of the city that owns the identified zone to (a) interpret an offset-less start time, (b) decide which calendar day the match falls on for the booking window, and (c) judge the 30-minute mark (FR-005). No service-wide default time zone is applied.
- **FR-023**: When the city that owns the identified zone has no time zone configured, the system MUST refuse the request with a distinct reason and MUST NOT guess. When the offset-less start time does not exist or is ambiguous in the city's time zone because of a daylight-saving change, the system MUST refuse it as an invalid start time.
- **FR-024**: Lead time (FR-015), minimum notice (FR-006) and surcharge tiers (FR-016) MUST be computed on real elapsed time between two instants, so they are unaffected by which time zone the city is in or by daylight-saving changes.

**Configuration scope**

- **FR-025**: The booking window, the minimum notice and the surcharge tiers MUST each be resolved for the city that owns the identified zone, in this order: (1) values defined for that city; otherwise (2) values defined for the country the city belongs to. Each of the three settings is resolved independently. When a setting is defined at neither level, the system MUST refuse the request with a distinct reason stating that the service is not configured for that area, and MUST NOT return a price or fall back to an assumed value.

### Key Entities

- **Quote Request**: The five inputs a client supplies — location (latitude, longitude), match start date-and-time, number of goalkeepers (1–2), duration (60/90/120 minutes). It is transient: evaluated and answered, never stored.
- **Quote**: The result returned to the client — unit rate, number of goalkeepers, goalkeeper subtotal, lead-time surcharge, total, currency. Also transient.
- **Rental Rate**: The price for one goalkeeper for one duration, defined either for a specific zone or for a city, together with its currency. Zone-level rates take priority over city-level rates for the same duration. Managed outside this feature (pre-seeded data); this feature only reads it.
- **Lead-Time Surcharge Tier**: A configurable row of "from X minutes up to (but not including) Y minutes ahead → surcharge amount", in a stated currency. Tiers are defined per country (inherited by its cities) and may be overridden for a specific city.
- **Booking Rules Setting**: The maximum number of days ahead a match may be scheduled and the minimum notice in minutes. Defined per country (inherited by its cities) and may be overridden for a specific city. No built-in values exist.
- **Zone / City** (existing): A zone is a geographic service area belonging to a city; the point-to-zone lookup determines which rates apply. Zones and cities already exist and are read-only here, except that each city needs a time-zone attribute (see Assumptions). Each city belongs to a country, which is the level at which booking rules and surcharge tiers are configured.
- **City Time Zone**: A standard region-based time-zone identifier stored on each city. It defines how the match's local time, calendar day and 30-minute marks are read for every location in that city's zones.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a fixed test set covering every combination of duration (3), quantity (2) and surcharge tier (3), 100% of quotes match the pricing rules exactly (subtotal, surcharge and total).
- **SC-002**: At every minimum-notice boundary (29:59, 30:00 minutes of lead time), every surcharge-tier boundary (59:59, 60:00, 119:59, 120:00) and every booking-window boundary (last allowed minute, first disallowed minute), 100% of test requests are classified correctly.
- **SC-003**: 95% of quote requests receive their answer (price or refusal) in under 2 seconds under normal load.
- **SC-004**: 100% of refused requests carry a reason that identifies the specific rule broken, with no request refused for an unspecified reason and no price ever returned for a refused request.
- **SC-005**: A change to the booking window, the minimum notice or a surcharge tier is reflected in quotes within 1 minute, without a software release.
- **SC-006**: For any location inside a covered zone that lacks its own rate for the requested duration, 100% of quotes fall back to the city rate rather than failing, whenever the city has one.
- **SC-007**: Requesting any number of quotes leaves stored bookings, availability and settings unchanged (zero side effects).
- **SC-008**: For test cities covering at least three time zones — including one with a half-hour offset and one that observes daylight-saving time — 100% of start times (offset-less and with offsets) are interpreted, window-checked and 30-minute-mark-checked in the correct city-local time, and 100% of daylight-saving gap/overlap times are refused.
- **SC-009**: For test data with two countries and one city that overrides its country's values, 100% of quotes use the city's values in that city, the country's values in every other city of that country, and the other country's values (and currency) elsewhere; and 100% of quotes for areas with a missing setting at both levels are refused with no price.

## Assumptions

- **Currency**: Each rate and each set of surcharge tiers carries its own currency, so the service can price in other countries; current pricing is in Colombian pesos (COP), whole units. The quote returns the currency of the resolved rate.
- **Time zone**: The service will open in cities in different countries, so time zone is per city (FR-022), not a single service-wide value. The match time is the local wall-clock time at the pitch's city. The city's time-zone attribute does not exist on cities today: populating it for every city that has zones (starting with the current Colombian cities, `America/Bogota`) is a data prerequisite owned by the database owner, and a city without one cannot be quoted (FR-023). Which city's time zone applies is the city that owns the identified zone, the same city whose rates are used for the fallback.
- **Window meaning**: A booking window of 2 days (the Colombian value) means the current calendar day and the next calendar day, per the source description ("permite reservar para el día actual y el día siguiente").
- **Rates and settings data**: Zone/city rates, the per-country (and optional per-city) surcharge tiers, booking window and minimum notice are seeded and maintained directly in the database by the owner; building an admin interface to edit them is out of scope. The already-existing zones and cities collections are read as they are.
- **Location-to-city mapping**: Cities carry no geographic boundary of their own, so a coordinate can only be assigned to a city through the zone that contains it.
- **Authentication**: The quote is for signed-in clients using the existing authentication; anonymous quoting is out of scope.
- **Tie-break for overlapping zones**: The zone that appears first in the existing zone display ordering wins.
- **Minimum notice and other rules have no defaults**: Aligned with rule R2 of the earlier find-goalkeeper plan (`specs/006-find-goalkeeper/IMPLEMENTATION_PLAN.md`), the current Colombian minimum notice is 30 minutes and the window is 2 days, but both are data, not built-in values: a country or city with no configuration cannot be quoted (FR-025). This replaces the "default of 2 days" fallback in the original description. Launching the Colombian market therefore requires the Colombian configuration to be seeded first. As a consequence of the 30-minute minimum, the "less than 60 minutes" surcharge tier is in practice only reachable for 30–59 minutes of notice there, but tiers stay defined for the full range so other configurations work.
- **City-to-country link**: The country of a city must be determinable. Cities today link to a region and this system does not yet model a link to a country; how a city's country is obtained (directly or through its region) is a planning matter and a data prerequisite.
- **Scope boundary**: This feature only produces a price. Creating a booking request, notifying goalkeepers, accepting, and payment belong to later work (the find-goalkeeper flow) and are out of scope.
