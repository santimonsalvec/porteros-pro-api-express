/**
 * What the admin web sees of a goalkeeper and of a registration in progress (admin spec 005,
 * contracts/users-goalkeepers-api.md §3–§4). The document number and its photos are never part of
 * these views: they have their own audited read.
 */

export interface RatingSummary {
  /** Rounded to one decimal. */
  average: number;
  count: number;
}

export interface GoalkeeperRow {
  userId: string;
  name: string | null;
  city: { id: string; name: string } | null;
  zoneCount: number;
  availableForOffers: boolean;
  suspendedUntil: string | null;
  balance: number;
  currency: string | null;
  rating: RatingSummary | null;
  blocked: boolean;
}

export interface DocumentTypeRef {
  code: string;
  name: string;
}

export interface GoalkeeperDetail {
  userId: string;
  name: string | null;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activatedAt: string;
  city: { id: string; name: string; timeZone: string | null } | null;
  zones: { id: string; name: string; active: boolean }[];
  availableForOffers: boolean;
  suspendedUntil: string | null;
  blocked: boolean;
  documentType: DocumentTypeRef;
  /** The fingerprint a document correction sends back (research §9). */
  version: string;
  rating: RatingSummary | null;
  stats: {
    /** This month's numbers (feature 026); `null` when they can't be computed. */
    month: { playedCount: number; earned: number; toPlay: number; currency: string } | null;
    withdrawalCount: number;
    noShowCount: number;
  };
}

/** The audited read of the document (FR-008). */
export interface GoalkeeperDocumentView {
  documentType: DocumentTypeRef;
  documentNumber: string;
  /** `null` when the image no longer exists. */
  photos: { front: string | null; back: string | null };
}

/** What a document correction's audit entry keeps: never the number (research §8). */
export interface DocumentCorrectionAudit {
  userId: string;
  documentType: DocumentTypeRef;
  idNumberChanged: boolean;
  changedFields: string[];
  version: string;
}

export type RegistrationStep = 'identification' | 'physicalData' | 'availability' | 'ready';
export type SectionName = Exclude<RegistrationStep, 'ready'>;
export type FieldStatus = 'complete' | 'missing';

export interface RegistrationRow {
  userId: string;
  name: string | null;
  email: string | null;
  step: RegistrationStep;
  completeSections: SectionName[];
  cityName: string | null;
  createdAt: string;
  updatedAt: string;
  idleDays: number;
}

export type RegistrationSummary = Record<RegistrationStep, number>;

export interface RegistrationDetail {
  userId: string;
  name: string | null;
  step: RegistrationStep;
  sections: {
    identification: { complete: boolean; fields: Record<string, FieldStatus> };
    physicalData: { complete: boolean; fields: Record<string, FieldStatus>; values: { heightCm: number | null; weightKg: number | null } };
    availability: { complete: boolean; city: { id: string; name: string } | null; zones: { id: string; name: string }[] };
  };
  createdAt: string;
  updatedAt: string;
}
