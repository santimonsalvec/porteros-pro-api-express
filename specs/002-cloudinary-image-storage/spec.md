# Feature Specification: Cloudinary Image Storage Integration

**Feature Branch**: `002-cloudinary-image-storage`
**Created**: 2026-08-30
**Status**: Draft
**Input**: User description: "vamos a integrar a cloudinary como proveedor de almacenamiento de imagenes y tambien vamos a crear en infraestructura un servicio para gestion de imagenes... es importante que podamos conservar las imagenes pero optimizadas en peso sin perder calidad, el ideal es que la optimización se resuelva dentro de la implementacion del proveedor... tambien es importante que cada vez que almacenemos una imagen almacenemos esta en nuestra base de datos de mongo para poder gestionarlas mas adelante, guardemos una entidad generica no acoplada a la respuesta del proveedor y no te llenes de datos, solo los relevantes... por ultimo, en mi servicio de imagenes no quiero implementar todas las caracteristicas que ofrece el proveedor como por ejemplo la de transformacion, lo unico que quiero es el almacenamiento y todo lo relacionado con el almacenamiento"

## Clarifications

### Session 2026-08-30

- Q: Should stored images be reachable via a permanently public link, or must every access to an image go through this system's own authentication/authorization? → A: Every access must go through this system. Images (e.g., a person's identity document photo, a profile photo) will be referenced from the entities that own them (existing or future). Whenever a request would return data that includes an image, the system must first validate the requester has a valid token and is authorized for the specific resource being requested — the image is only ever surfaced through that resource's own authenticated, authorized response, never as a standalone public endpoint.
- Q: Once an authorized response hands out an image's accessible location, should that specific link keep working indefinitely, or should it be short-lived/re-validated so a leaked or cached copy stops working? → A: The link is stable and keeps working indefinitely once obtained through an authorized response. Protection relies on the authentication/authorization check performed when the location is handed out (per FR-005) — not on the link itself expiring or being re-checked on direct fetches.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Store an optimized image (Priority: P1)

An authenticated user uploads a photo — often a high-resolution image captured on a mobile device — and the system keeps it, but as a size-optimized copy that preserves visual quality, along with a record the system can use to find and manage it later.

**Why this priority**: This is the core value of the feature. Without reliable, optimized storage, no other capability (retrieval, deletion, or any future feature that needs to attach an image) has anything to work with. Uncontrolled file sizes from mobile cameras are the specific pain point driving this work.

**Independent Test**: Can be fully tested by uploading a large, high-resolution image and verifying that (a) the stored image is retained with no visible quality loss, (b) its stored size is meaningfully smaller than the original, and (c) a corresponding management record exists immediately after the upload succeeds.

**Acceptance Scenarios**:

1. **Given** an authenticated user has a high-resolution photo taken on a mobile device, **When** they upload it, **Then** the system stores an optimized version of the image that is visibly no lower in quality, and creates a matching management record.
2. **Given** a user uploads a supported image file, **When** the upload completes successfully, **Then** the system returns an identifier and an accessible location for the stored image.
3. **Given** a user attempts to upload a file that is not a valid image (e.g., a document) or exceeds the maximum allowed size, **When** they submit it, **Then** the system rejects the upload with a clear error and no management record is created.
4. **Given** the storage provider fails or is unreachable during an upload, **When** the failure occurs, **Then** the system does not create a management record for that attempt and reports a clear error.

---

### User Story 2 - Retrieve a stored image (Priority: P2)

Whichever resource references a stored image (e.g., a person's profile, an identity document field) needs to resolve it to a current, viewable location — but only for a requester who is authenticated and authorized to see that specific resource.

**Why this priority**: Storing an image has no value if it cannot be located and displayed again. This is the minimum capability needed to make stored images usable — but because stored images can include sensitive personal content (e.g., identity documents), this must never bypass the authentication and authorization already required to view the resource that references it.

**Independent Test**: Can be fully tested by storing an image, then resolving it by its identifier as an authorized requester and confirming the correct accessible location is returned; by attempting the same as an unauthenticated or unauthorized requester and confirming access is denied; and by requesting an identifier that does not exist and confirming a clear "not found" response.

**Acceptance Scenarios**:

1. **Given** an image was previously stored successfully, **When** an authenticated requester who is authorized for the resource referencing it asks for it by its identifier, **Then** the system returns its current accessible location.
2. **Given** an identifier that does not correspond to any stored image, **When** it is requested, **Then** the system returns a clear "not found" response.
3. **Given** a request with no valid authentication token, or from a requester who is authenticated but not authorized for the resource an image belongs to, **When** they attempt to resolve or view that image, **Then** the system denies the request rather than returning the image's location.

---

### User Story 3 - Remove a stored image (Priority: P3)

A user needs to permanently remove an image they no longer want kept — for example, replacing an outdated photo or cleaning up stale data.

**Why this priority**: Necessary for data lifecycle management and storage cost control, but the system delivers value (storing and viewing images) even before deletion exists, so it is lower priority than Stories 1 and 2.

**Independent Test**: Can be fully tested by storing an image, deleting it, and confirming it is no longer retrievable and its management record is gone; and by attempting to delete an image that isn't the requester's own and confirming it is denied.

**Acceptance Scenarios**:

1. **Given** a previously stored image, **When** the user who uploaded it requests its deletion, **Then** the image is removed from storage, its management record is removed, and it can no longer be retrieved.
2. **Given** a request to delete an image that does not exist (or was already deleted), **When** it is submitted, **Then** the system returns a clear "not found" response rather than an error.
3. **Given** a user who did not upload a given image, **When** they attempt to delete it, **Then** the system denies the request.

---

### Edge Cases

- What happens when the storage provider succeeds in storing the file but the subsequent write to the management record fails? The system must not end up with a stored file that has no corresponding record, or a record with no underlying file.
- What happens when an upload is interrupted partway (e.g., dropped mobile connection)? No partial or orphaned record should be created.
- How does the system handle a mobile photo whose orientation is described via metadata rather than the actual pixel layout? The stored, optimized image must display right-side-up.
- How does the system handle an upload that is technically a valid image format but corrupted or unreadable? It must be rejected like any other invalid upload.
- How does the system handle two deletion requests for the same image arriving at nearly the same time? The end state must be consistent (image removed once, no errors from the second request beyond a "not found").
- How does the system handle a file that matches an accepted format's extension but isn't actually an image? It must be rejected based on actual content, not just file name.
- What happens when an authenticated user who lacks permission for the resource an image belongs to requests that image (e.g., another person's identity document)? Access must be denied, the same as if they had asked for a resource they can't see.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated user to upload an image file for persistent storage.
- **FR-002**: System MUST automatically optimize every stored image to reduce its file size while preserving visual quality, with that optimization performed as part of the storage step rather than as a separate image-processing pipeline built and maintained by this system.
- **FR-003**: System MUST create a corresponding management record for every image successfully stored.
- **FR-004**: The management record MUST use a structure defined by this system rather than mirroring the storage provider's response, and MUST capture only the fields needed to reference, display, and manage the image (no provider-specific data unrelated to those needs).
- **FR-005**: System MUST require the requester to be authenticated and authorized for the specific resource/entity referencing an image before returning that image's accessible location — this check MUST be performed each time the system resolves an image on behalf of a request. An image's location MUST NOT be exposed through a standalone, unauthenticated public endpoint that skips this check; it is only ever surfaced as part of the authenticated, authorized response of whatever resource references it. Once handed out through such a response, the returned location itself is a stable link that keeps working on direct access without re-checking authorization — the protection is the check performed when it is handed out, not an expiring link.
- **FR-006**: System MUST return a clear "not found" result when retrieval or deletion is requested for an identifier that does not correspond to a stored image, and a clear denial when the requester is unauthenticated or unauthorized for the referencing resource.
- **FR-007**: System MUST allow a previously stored image to be permanently deleted, removing it from both the storage provider and the management record store as a single, consistent outcome.
- **FR-008**: System MUST restrict deletion of an image to the user who uploaded it (or an authorized system process), and deny the request otherwise.
- **FR-009**: System MUST reject uploads that are not valid, supported image files, and MUST NOT create a management record for a rejected or failed upload.
- **FR-010**: System MUST enforce a maximum accepted upload size and reject files exceeding it with a clear error before an unusable partial record can be created.
- **FR-011**: System MUST limit itself to storage-related capabilities of the provider (storing, retrieving, deleting, and the automatic optimization in FR-002). It MUST NOT implement or expose other capabilities the provider offers that are unrelated to storage, such as on-demand image transformation, editing, or effects.
- **FR-012**: System MUST prevent inconsistent outcomes where an image exists at the storage provider without a matching management record, or a management record exists without a corresponding stored image.

### Key Entities

- **Stored Image**: A generic, provider-independent record representing one image the system has stored on a user's behalf. Captures only what's needed to reference, display, and manage it: an internal identifier, a reference back to the file at the storage provider (needed to manage it later), its current accessible location, its format, its optimized size, its dimensions, who uploaded it, and when it was stored. Deliberately excludes provider-specific fields that don't serve one of those needs. Other entities (existing or future — e.g., a person's profile, an identity document field) reference a Stored Image by its identifier; that referencing entity is what determines who is authorized to view it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user uploading a typical high-resolution mobile photo sees it become available for use in under 5 seconds under normal network conditions.
- **SC-002**: Stored images are, on average, at least 50% smaller than the originally uploaded file, with no perceptible loss of visual quality to a viewer.
- **SC-003**: 100% of successfully stored images have a retrievable management record immediately after upload; 0% of failed or rejected uploads leave behind a management record.
- **SC-004**: A deleted image is no longer retrievable and its management record is gone within 5 seconds of the deletion request completing.
- **SC-005**: Uploads of unsupported file types or oversized files are rejected with a clear, actionable error on the first attempt, without requiring the user to guess why it failed.

## Assumptions

- This feature delivers a standalone, reusable image storage capability (store, retrieve, delete) used internally by this backend's application layer — for example, to hold a person's identity-document photo or profile photo. It does not define how any specific business feature associates itself with a stored image — that linkage belongs to whichever future feature (existing or new entity) consumes this capability, and that same feature is responsible for enforcing which requesters may see the resulting image.
- "Optimization" means automatic compression and format selection performed by the storage provider itself at storage/delivery time, not a custom image-processing pipeline built by this system.
- Accepted image formats are the common formats produced by mobile devices and browsers (e.g., JPEG, PNG, WEBP, HEIC/HEIF); anything else is rejected.
- Maximum upload size is assumed to be 10 MB per image, comfortably above typical mobile photo sizes; this is a provisional default that can be revisited.
- Deletion authorization defaults to "uploader or authorized system process only," since no broader sharing/ownership model was specified.
- No new authentication mechanism is introduced; the system's existing user authentication is reused to identify who is uploading or deleting an image.
- Provider account setup, API credentials, and billing/plan considerations for the storage provider are handled outside this specification.
- An image's accessible location does not expire or re-validate on direct access once obtained through an authorized response; it is treated as sensitive output that referencing features must not needlessly log, cache, or re-expose. If access to a specific image must be revoked after the fact, that is handled by deleting or replacing the stored image, not by the location becoming invalid on its own.
