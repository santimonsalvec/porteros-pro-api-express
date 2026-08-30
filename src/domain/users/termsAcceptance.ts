import { Entity } from '../common/entity.js';

/** Append-only, timestamped record proving a specific user accepted specific legal documents. */
export class TermsAcceptance extends Entity<string> {
  readonly userId: string;
  readonly termsVersion: string;
  readonly privacyPolicyVersion: string;
  readonly acceptedAt: Date;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;

  constructor(params: {
    id: string;
    userId: string;
    termsVersion: string;
    privacyPolicyVersion: string;
    acceptedAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }) {
    super(params.id);
    this.userId = params.userId;
    this.termsVersion = params.termsVersion;
    this.privacyPolicyVersion = params.privacyPolicyVersion;
    this.acceptedAt = params.acceptedAt;
    this.ipAddress = params.ipAddress;
    this.userAgent = params.userAgent;
  }
}
