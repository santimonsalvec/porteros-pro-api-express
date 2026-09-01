# Feature Specification: Become a Portero — Progressive Registration & Activation

**Feature Branch**: `003-convertirse-portero`
**Created**: 2026-08-30
**Status**: Draft
**Input**: User description: "Necesito diseñar y construir los servicios backend para el flujo de \"Convertirse en portero\". Es un registro PROGRESIVO: el cliente completa 4 secciones de datos a su propio ritmo (puede guardar una sección hoy y otra la próxima semana), y solo cuando las 4 están completas puede \"activar\" su perfil de portero. También debe poder cancelar el registro en cualquier momento y perder el progreso guardado, para esto necesitamos una entidad aparte por si decide cancelar el proceso entonces se borran los datos capturados. Contexto: un cliente ya autenticado (el perfil de cliente y su auth ya existen) decide registrarse ADEMÁS como portero. No reemplaza su cuenta de cliente, la complementa. Las 4 secciones: Identificación (tipo/número de documento, fecha de expedición, fecha de nacimiento, foto de documento lado A y lado B), Datos físicos (estatura, peso), Ubicación (latitud, longitud, ciudad, departamento/estado, país, barrio opcional, dirección formateada de uso interno no expuesta), Disponibilidad (radio de cobertura en km, 10-50). Incluye un diseño de endpoints propuesto (GET/PATCH del recurso, subida de fotos de documento, activar, cancelar) y reglas de validación por campo."

## Clarifications

### Session 2026-08-30

- Q: Minimum age to register as a portero? → A: 18 years — standard legal adulthood, no special justification for a higher bar.
- Q: Must a document number be unique across portero registrations? → A: Enforced — the combination of document type and document number must not have been registered before; a submission matching an already-registered (document type, document number) pair is rejected as a duplicate.
- Q: Can a section be edited through this feature once the portero profile is already active? → A: No — this feature's data-entry capability (saving section data) only operates while the registration is not yet active; once active, any attempt to modify a section through it is rejected. The Portero Registration is a temporary/draft entity that exists only up to activation: activation reads its completed data and uses it to establish the portero's active, permanent record. Any later changes to that active record are the responsibility of a separate, future active-profile-management capability, out of scope here.
- Q: What format/size validation applies to identification document photos? → A: Reuse the existing system-wide image validation rules as-is (currently JPEG/PNG/WEBP/HEIC/HEIF, size cap set by system configuration) — no portero-specific override.
- Q: What happens to the draft Portero Registration record after activation? → A: Retained, locked — it stays as a historical/audit trail once activation consumes it into the active Portero Profile, but nothing in it can be edited or re-activated again.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Save registration progress one section at a time (Priority: P1)

A client who already has an account and a client profile decides they also want to work as a portero. They don't have every piece of information on hand right away — a document photo might require finding their ID, a location might require being at home to confirm the address. They fill in and save whichever section they're ready for today (say, physical data), close the app, and come back another day — sometimes weeks later — to fill in the next section (say, location), without losing anything they already saved.

**Why this priority**: This is the entire premise of the feature. Without the ability to save partial progress and resume later, there is no "progressive" registration — the client would be forced into an all-or-nothing form, which is explicitly what this feature exists to avoid. Every other capability (activation, cancellation) only makes sense once partial, resumable progress exists.

**Independent Test**: Can be fully tested by having an authenticated client save data for exactly one of the four sections, ending their session, returning later, and confirming that section's data and completion state are exactly as left, while the other three sections remain untouched and incomplete.

**Acceptance Scenarios**:

1. **Given** a client with no portero registration yet started, **When** they submit valid data for one section, **Then** that section is saved and marked complete, and the other three sections remain in whatever state they were in before (untouched).
2. **Given** a client previously saved one or more sections, **When** they check their registration at a later time, **Then** they see the exact values they previously saved and which sections are complete versus still missing.
3. **Given** a client submits invalid data for a field within a section (e.g., an out-of-range value, a malformed date, an unrecognized document type), **When** they submit it, **Then** the system rejects only that submission with a clear, field-specific reason, does not mark the section complete, and does not discard any other section's already-saved data.
4. **Given** a client has already saved a section, **When** they submit new data for that same section before activating their profile, **Then** the newly submitted values replace the previous ones for that section.
5. **Given** a client uploads a photo for one side of their identification document, **When** they later upload another photo for that same side, **Then** only the most recently submitted photo for that side is retained — the previous one is no longer kept anywhere in the system.
6. **Given** a client uploads a photo for one side of their identification document, **When** they have not yet uploaded a photo for the other side, **Then** the identification section remains incomplete until both sides are present, while the photo already provided is retained and not lost.
7. **Given** a client's portero profile is already active, **When** they attempt to save data for any section through this registration capability, **Then** the system rejects the attempt — an active portero's data is managed through a separate capability, not this one.

---

### User Story 2 - Activate portero profile once all sections are complete (Priority: P2)

Once a client has saved all four sections — identification (including both document photos), physical data, location, and availability — they can activate their portero profile. Activation is the moment their registration effort becomes real: their profile becomes visible to clients who are searching for porteros to hire.

**Why this priority**: This is the payoff of the whole flow — without it, progressive saving has no destination. It's ranked after Story 1 because activation is meaningless until there is a mechanism for sections to actually become complete over time.

**Independent Test**: Can be fully tested by completing all four sections for a client, requesting activation, and confirming the profile becomes active and discoverable; and separately, by requesting activation with at least one section incomplete and confirming it is refused with a clear indication of what's missing.

**Acceptance Scenarios**:

1. **Given** a client has completed all four sections, **When** they request activation, **Then** their portero profile becomes active and is now discoverable by clients searching for porteros.
2. **Given** a client has one or more sections incomplete, **When** they request activation, **Then** the system refuses the request, clearly identifies every section still missing, and the profile remains inactive.
3. **Given** a client activates their portero profile, **When** they continue using the app as a client (e.g., searching for or requesting porteros themselves), **Then** their client capabilities and existing client profile remain fully intact and unaffected — activation adds a new capability, it does not replace or reset the client account.
4. **Given** a client's portero profile has been activated, **When** another client searches for available porteros, **Then** only the approximate location (city, state/department, country, and neighborhood if provided) is shown — never the precise coordinates or the full verified address captured during registration.

---

### User Story 3 - Cancel an in-progress registration (Priority: P3)

A client who started the portero registration process changes their mind before finishing, and wants to abandon it entirely rather than leave it half-finished. Cancelling wipes out everything they had saved so far, including any uploaded document photos, giving them a clean slate.

**Why this priority**: Necessary for a good experience and for not accumulating abandoned personal data (including identity document photos) indefinitely, but the feature already delivers its core value (progressive saving and eventual activation) without this capability, so it's ranked last.

**Independent Test**: Can be fully tested by having a client save data and photos in one or more sections, cancelling the registration, and confirming none of that data or those photos are retrievable afterward and the registration resets to a fresh, not-started state; and separately, by confirming an already-active portero profile cannot be cancelled through this capability.

**Acceptance Scenarios**:

1. **Given** a client has an in-progress (not yet activated) registration with data saved in one or more sections, **When** they cancel it, **Then** all previously saved section data and any uploaded document photos are permanently discarded, and their registration returns to a fresh, not-started state.
2. **Given** a client's portero profile is already active, **When** they attempt to cancel through this capability, **Then** the system refuses the request — deactivating or removing an already-active portero profile is a separate capability, out of scope here.
3. **Given** a client cancels and later decides to register again, **When** they start again, **Then** they begin from a completely fresh registration with no trace of the previously discarded data.

---

### Edge Cases

- What happens when a client tries to activate with the identification section only partially done (e.g., all four fields present but only one of the two document photos uploaded)? Activation must be refused and identification counted as an incomplete section.
- What happens when the document issue date is submitted as being before the birth date, or either date is in the future? Both must be rejected as invalid.
- What happens when a client is younger than the minimum required age based on the submitted birth date? The submission must be rejected.
- What happens when a client submits a coverage radius outside the allowed 10–50 km range, or a non-whole-number value? It must be rejected.
- What happens when a client submits latitude/longitude values outside valid geographic bounds? They must be rejected.
- What happens if a client cancels a registration that has no data saved at all (never started any section)? The system should handle this gracefully, resulting in the same not-started state.
- What happens to a client's already-saved section data if they never activate and never cancel? It must remain saved indefinitely until the client acts (activates or cancels) — there is no automatic expiration in scope for this feature.
- What happens when a client submits a document type outside the fixed, known set of accepted document types? It must be rejected.
- What happens when a client submits a document type and number combination that another client (or the same client's prior, since-cancelled registration) has already registered? It must be rejected as a duplicate, since a cancelled registration's data is fully discarded and its document number is free to be reused, but a document number in use by any current (in-progress or active) registration is not.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated client who already has a client profile to begin portero registration, consisting of four independently trackable sections: identification, physical data, location, and availability.
- **FR-002**: System MUST allow a client to save data for any one section without requiring any other section to be started or complete first, and in any order.
- **FR-003**: System MUST persist previously saved section data and uploaded document photos indefinitely (with no automatic expiration) until the client either activates their portero profile or explicitly cancels the registration.
- **FR-004**: System MUST let a client retrieve, at any time, the current state of their registration: the values already saved for each section (or absence thereof) and which sections are complete versus still missing.
- **FR-005**: System MUST consider the identification section complete only when a valid document type, document number, document issue date, birth date, and both required document photos (one per side of the document) have all been captured.
- **FR-006**: System MUST consider the physical data section complete only when both height and weight have been captured.
- **FR-007**: System MUST consider the location section complete only when latitude, longitude, city, state/department, and country have all been captured; a neighborhood/zone value is optional and does not affect completeness.
- **FR-008**: System MUST consider the availability section complete only when a coverage radius has been captured.
- **FR-009**: System MUST validate the document type against a fixed, closed set of accepted values and reject any value outside that set.
- **FR-010**: System MUST reject a document issue date that is in the future or that falls before the submitted birth date.
- **FR-011**: System MUST reject a birth date that is in the future or that indicates the client is younger than 18 years old, the minimum required age to register as a portero.
- **FR-012**: System MUST validate that height and weight fall within realistic human ranges, that latitude and longitude fall within valid geographic bounds, that city/state/country are non-empty, and that the coverage radius is a whole number within the allowed 10–50 km range — rejecting any submission that fails these checks with a reason specific to the failing field.
- **FR-013**: System MUST allow a client to upload a photo for either side of their identification document independently — one side may be provided before the other, in either order.
- **FR-014**: When a client uploads a replacement photo for a document side that already has one stored, the system MUST discard the previously stored photo so that only the most recently submitted photo for that side is retained anywhere in the system.
- **FR-015**: Identification document photos MUST NOT be exposed as publicly accessible files; they may only be accessed through the same authenticated, authorized channels as the rest of a client's own registration data.
- **FR-016**: System MUST prevent a client from activating their portero profile unless all four sections are complete, and MUST clearly indicate every section still incomplete when activation is attempted prematurely.
- **FR-017**: Upon successful activation, System MUST make the client's portero profile discoverable to other clients searching for porteros.
- **FR-018**: System MUST NOT expose a portero's precise coordinates or their full/formatted verified address to any client-facing view or search result — only the approximate location (city, state/department, country, and neighborhood/zone if provided) may be shown; the precise coordinates and formatted address are for internal verification and coverage-radius calculation only.
- **FR-019**: Activating a portero profile MUST NOT alter, remove, or replace the client's existing client-facing profile or capabilities — a single account MUST be able to hold both the client and portero capabilities simultaneously.
- **FR-020**: System MUST allow a client to permanently cancel an in-progress (not yet activated) registration, which discards all previously saved section data and all uploaded document photos for that registration.
- **FR-021**: System MUST refuse a cancellation request once a client's portero profile is already active; deactivating or removing an active portero profile is a separate capability, out of scope for this feature.
- **FR-022**: System MUST make the fixed set of valid identification document types available to client applications, so they can present the correct choices to the client.
- **FR-023**: System MUST reject an identification submission whose combination of document type and document number matches one already registered by any other portero registration (in progress or active) — a given identity document may only ever be registered once across the system.
- **FR-024**: System MUST reject any attempt to save section data through this registration capability once the client's portero profile is already active; an active portero's data is out of this feature's reach, reserved for a separate, future active-profile-management capability.
- **FR-025**: Upon successful activation, System MUST read the registration's completed section data and use it to establish the portero's active, permanent record — the Portero Registration itself is a temporary/draft entity whose data-entry capability exists only up to the point of activation.
- **FR-026**: Upon successful activation, System MUST retain the now-locked Portero Registration record as a historical/audit trail; it MUST NOT be deleted, further edited, or re-activated after that point.

### Key Entities

- **Portero Registration**: One per client, a draft record tracking their progressive path toward becoming a portero, whose data-entry capability exists only up to activation. Holds the values captured so far for each of the four sections (each may be partially or fully populated, or entirely empty), the computed completeness of each section, and a status (not started, in progress, or active). While not yet activated, its data — including any uploaded document photos — is deleted in full if the client cancels. Once activated, its data is used to establish the Portero Profile and the record itself becomes permanently locked (retained as a historical/audit trail, never edited, deleted, or re-activated again). The combination of document type and document number MUST be unique across all Portero Registrations (in progress or active) — the same identity document cannot be registered more than once.
- **Portero Profile**: The active, permanent record establishing a client as a discoverable portero, created from a Portero Registration's completed data at the moment of activation. Once it exists, the originating Portero Registration's data-entry capability no longer applies — any future changes to a Portero Profile belong to a separate, out-of-scope active-profile-management capability. A client and their Portero Profile belong to the same underlying account as their existing client profile but are separate, additive concerns.
- **Identification Document Photo**: One per side ("A"/"B") of a client's identification document, associated with a client's Portero Registration. Privately stored — never publicly accessible. Replacing one discards the prior photo for that side.
- **Identification Document Type**: A fixed, small reference list of the kinds of identification documents accepted (e.g., national ID, foreign resident ID, passport). Maintained as reference data, not something clients can create or modify.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client can save any single registration section and, after any length of time away, resume to find that section's data and completion state preserved exactly as they left it, with no data loss.
- **SC-002**: A client attempting to activate before all sections are complete is told, on the very first attempt, exactly which section(s) remain incomplete — with no need to guess or retry to find out.
- **SC-003**: Once a client successfully activates, their portero profile becomes discoverable to clients searching for porteros without any additional action required from the newly activated portero.
- **SC-004**: A client can complete their entire registration across any number of separate sessions, in any order, with no minimum number of sessions or maximum time allowed between them.
- **SC-005**: Cancelling an in-progress registration results in 100% of that registration's previously saved section data and document photos becoming permanently unretrievable.
- **SC-006**: 100% of submissions containing an out-of-range value, invalid date, or unrecognized document type are rejected with a field-specific reason on the first attempt, rather than a generic failure.
- **SC-007**: 0% of client-facing searches or profile views for an active portero ever reveal that portero's precise coordinates or full verified address.

## Assumptions

- The client authentication and client-profile system already in place is reused as-is; this feature introduces no new way to sign in or establish identity, and requires an existing, authenticated client profile as a prerequisite for starting portero registration.
- Minimum age to register as a portero is 18 years (confirmed via clarification), a new, explicit rule for this feature — no existing minimum-age rule was found elsewhere in this system to reuse.
- The set of accepted identification document types is a small, fixed list (national ID, foreign resident ID, passport) maintained as reference data by whoever administers the system — not something registration clients can add to or edit. This is new reference data specific to this feature; no existing document-type catalog exists elsewhere in the system to reuse.
- Editing an already-active portero profile (as opposed to a still-in-progress registration) is out of scope for this feature; this specification covers only the path from "not started" through "in progress" to "active," and the one-time cancellation of an in-progress registration. Ongoing management of an active portero profile is assumed to be handled by a separate, future capability.
- How the client-search experience that discovers active porteros actually ranks, filters, or presents results (beyond respecting the location-privacy rule in FR-018) is assumed to be a separate, existing or future capability that this feature only feeds by making a portero profile discoverable once active — the search/matching experience itself is not designed here.
- Document photos reuse this system's existing image format and size validation as-is (confirmed via clarification) — no portero-specific override on accepted formats or maximum file size.
- There is no limit in scope on how long a registration may sit in progress before the client either activates or cancels it — no automatic expiration or reminder mechanism is assumed.
