# Feature Specification: Goalkeeper Service Zones (Zone-Based Availability)

**Feature Branch**: `005-goalkeeper-service-zones`
**Created**: 2026-09-14
**Status**: Draft
**Input**: User description: "Backend para la pantalla de \"Disponibilidad\" de un portero (fútbol amateur), reemplazando el viejo sistema de radio en KM por selección de zonas poligonales. Mockup de referencia: portero-editar-disponibilidad.html. El portero busca su ciudad (aún no la tiene asignada), ve un mapa con las zonas de esa ciudad, selecciona una o varias, y al guardar se persisten ciudad + zonas juntas. `zones` y `cities` ya existen en MongoDB; `cities` tiene `zoneCityId` (autorreferencia a la ciudad ancla que realmente tiene zonas). Se agrega búsqueda de ciudades (`GET /api/locations/cities?q=`), un endpoint de zonas por ciudad (`GET /api/zones?cityId=`), y se cambia el contrato de `PATCH /api/goalkeepers/me/availability` de `{ radiusKm }` a `{ cityId, zoneIds }` con las validaciones correspondientes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose a service city and zones, and save availability (Priority: P1)

A goalkeeper who has not yet set a service area searches for their city, sees the service zones available within it, selects one or more zones they're willing to work in, and saves. This is what makes them discoverable to clients searching by zone.

**Why this priority**: This is the entire point of the feature — without it, goalkeepers cannot declare where they're available, and clients cannot find them by zone. Every other story exists to support this one.

**Independent Test**: Can be fully tested by searching for a city known to have configured zones, selecting one or more of its zones, saving, and confirming the goalkeeper's availability now reflects that exact city and zone selection.

**Acceptance Scenarios**:

1. **Given** a goalkeeper with no service city set yet, **When** they search for their city by name, **Then** they see matching cities with an indication of whether each one currently has service zones available.
2. **Given** a goalkeeper has picked a city that has configured zones, **When** they view that city, **Then** they see its list of active service zones, each with enough shape/location data to be drawn on a map.
3. **Given** a goalkeeper has selected one or more zones for their chosen city, **When** they save, **Then** their chosen city and the exact set of selected zones are persisted together, and retrieving their profile afterward reflects that same city and zones.
4. **Given** a goalkeeper picks a satellite city that belongs to a larger metro area (e.g., a city whose zones are actually owned by a neighboring anchor city), **When** they view its zones, **Then** they see the anchor city's zones, and **When** they save, **Then** their own chosen city (not the anchor) is what's recorded as their service city, alongside the selected zone(s).
5. **Given** a goalkeeper attempts to save with a city selected but zero zones chosen, **When** they submit, **Then** the save is rejected and nothing changes.

---

### User Story 2 - Resume a previously saved availability (Priority: P2)

A goalkeeper who already saved a service city and zones reopens their profile/registration data and sees exactly what they chose before, so they can review or change it before it's locked in.

**Why this priority**: Without this, goalkeepers have no way to confirm what they previously saved, and a client rebuilding the availability screen has nothing to pre-fill it with — making the save-and-forget flow untrustworthy.

**Independent Test**: Can be fully tested by saving a city and zone selection, then independently fetching the goalkeeper's own profile/registration data and confirming the same city and zone identifiers come back.

**Acceptance Scenarios**:

1. **Given** a goalkeeper has never saved a service city or zones, **When** they fetch their own profile/registration data, **Then** it clearly indicates no city or zones have been set yet (rather than an error or misleading default).
2. **Given** a goalkeeper previously saved a city and a set of zones, **When** they fetch their own profile/registration data, **Then** it includes that exact city and that exact set of zones.

---

### User Story 3 - Handle a city with no configured zones yet (Priority: P3)

A goalkeeper searches for and selects a city that the platform hasn't configured service zones for yet (for example, a city outside the currently supported metro areas). They're clearly told zones aren't available for that city yet, instead of hitting a dead end or a confusing error.

**Why this priority**: Not every city is supported on day one. Handling this gracefully prevents goalkeepers in unsupported cities from getting stuck or filing confused support requests, but it doesn't block the core save flow for supported cities.

**Independent Test**: Can be fully tested by searching for and selecting a real, existing city known to have no configured zones, and confirming the system clearly communicates that no zones are available and that saving availability for that city cannot proceed.

**Acceptance Scenarios**:

1. **Given** a city exists but has no active service zones configured (directly or via its metro anchor), **When** a goalkeeper looks it up in city search, **Then** it's marked as not yet having zones available.
2. **Given** a goalkeeper selects a city with no configured zones, **When** they try to view its zones, **Then** they're clearly told none are available, and no save can be completed for that city until zones exist.

---

### Edge Cases

- Searching for a city name with no matches at all → an empty/clear "no matches" result, not an error.
- A goalkeeper switches from a previously-viewed city to a different one before saving → the zone selection from the first city is discarded, not carried over or mixed into the new city's save.
- A save request names zones that exist but belong to a different city's zone set (not the saved city's own set or its anchor's) → the entire save is rejected with a clear explanation; nothing is partially saved.
- A save request names a zone id that is inactive or doesn't exist at all → the entire save is rejected with a clear explanation.
- A save request names a city id that doesn't exist → the entire save is rejected with a clear explanation.
- A goalkeeper whose profile has already been activated attempts to change their service city/zones → rejected, consistent with how every other part of an activated goalkeeper's registration data is locked from further edits.
- Two satellite cities that share the same metro anchor (e.g., two municipalities both resolving to the same anchor) → both see the identical zone list, and each can independently save that anchor's zones under their own respective chosen city.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST let an authenticated client search for cities by name and receive a small set of best matches (not a full unpaginated listing), each indicating whether that city currently has service zones available to select from.
- **FR-002**: City search MUST be available to any authenticated client, without requiring them to already have a goalkeeper registration in progress.
- **FR-003**: The system MUST let a client retrieve the list of active service zones for a given city they are considering — even before that city has been saved as their chosen service city — so it can be previewed prior to saving.
- **FR-004**: When the city a client is previewing zones for is a satellite of a larger metro area, the system MUST transparently resolve and return that metro area's zones as the previewed city's zones.
- **FR-005**: Zone listings (both for preview and anywhere else zones are shown) MUST only include zones marked active, in a stable, predictable display order.
- **FR-006**: Each returned zone MUST include enough geographic shape and label information for a client to render it as a distinct, tappable area on a map, plus its own identifier for selection purposes.
- **FR-007**: The system MUST clearly indicate when a requested city has no service zones currently configured (whether the city itself has none and isn't linked to an anchor, or its resolved anchor has none), distinctly from the city simply not existing.
- **FR-008**: The system MUST let a goalkeeper (whose profile has not yet been activated) save their chosen service city together with one or more selected service zones, as a single combined operation.
- **FR-009**: The system MUST reject a save attempt that includes zero selected zones.
- **FR-010**: The system MUST reject a save attempt whose named city does not exist.
- **FR-011**: The system MUST validate, for every zone named in a save attempt, that it exists, is active, and belongs to the saved city's own zone set or its resolved metro-anchor's zone set — rejecting the entire save with a detailed, per-zone-identifiable explanation if any zone fails this check.
- **FR-012**: On a successful save, the system MUST persist the goalkeeper's own chosen city (which may be a satellite city, distinct from its metro anchor) together with the exact set of saved zone identifiers.
- **FR-013**: The system MUST reject any attempt to change a goalkeeper's saved service city or zones once that goalkeeper's profile has been activated, consistent with how the rest of their registration data becomes locked at activation.
- **FR-014**: Whenever a goalkeeper retrieves their own profile/registration data, it MUST include their currently saved service city and service zones, or a clear indication that none has been saved yet if that's the case.

### Key Entities *(include if feature involves data)*

- **City**: A named place a goalkeeper can select as their service city. Belongs to a region. May itself own service zones, or may instead point to another city (its "zone anchor") that owns the zones actually used — modeling satellite municipalities of a larger metro area.
- **Service Zone**: A named, polygon-shaped area within an anchor city's territory that a goalkeeper can select to describe where they're available to work. Has a display position among its city's other zones and can be active or inactive.
- **Goalkeeper Availability**: The service city and set of service zones a specific goalkeeper has chosen. Editable only until that goalkeeper's profile is activated; drives which goalkeepers clients see when searching by zone.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A goalkeeper can go from searching their city to a successfully saved availability (city + at least one zone) in a single visit to the availability screen, with no more than one save action required.
- **SC-002**: 100% of save attempts containing a nonexistent, inactive, or mismatched-city zone are rejected outright, with zero partially-saved or inconsistent availability records ever produced.
- **SC-003**: Goalkeepers in any satellite municipality of a supported metro area see and can save from the exact same zone set as goalkeepers in that metro's anchor city, with no per-satellite-city configuration needed beyond linking it to its anchor.
- **SC-004**: A goalkeeper who previously saved availability sees that exact same city and zone selection when they return to review it, 100% of the time.
- **SC-005**: A goalkeeper searching for a city that isn't supported yet is told clearly, within the same search interaction, that it has no zones available — with zero cases of the flow silently failing or appearing broken instead.

## Assumptions

- The pre-existing goalkeeper "location" capability (a single reverse-geocoded point address — coordinates plus free-text city/state/country/neighborhood — captured earlier in registration) serves a different purpose than this feature and is unrelated to it: it is not modified, extended, or unified with the city/zone selection introduced here. This was investigated directly (rather than left as an open question) because the two capture fundamentally different, non-overlapping kinds of data — a single street-level point vs. a structured city selected from a hierarchical catalog, paired with named coverage zones.
- Consistent with every other part of a goalkeeper's registration, saving a service city/zones is only possible before that goalkeeper's profile has been activated; letting an already-active goalkeeper change their service zones is explicitly out of scope for this feature (it would require introducing new update behavior for activated profiles, which no part of the system currently supports).
- A city that appears in search results but has no configured zones yet can still be selected/previewed (so the goalkeeper can confirm it's simply not supported yet), but no availability can be successfully saved for it until zones exist for it.
- City search result volume is small enough that no pagination is needed — a capped set of best matches (roughly 10–15) is sufficient, mirroring the reference mockup's typeahead behavior.
- Region/locality display details shown alongside a city in search results (e.g., its containing region's name) are sourced from whatever the existing city reference data already provides; no new region data entry is introduced by this feature.
