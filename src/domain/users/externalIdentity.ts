/** Links a User Account to its identity at an external provider (currently Google only). */
export class ExternalIdentity {
  constructor(
    public readonly provider: string,
    public readonly subject: string,
    public readonly email: string,
  ) {}

  equals(other: ExternalIdentity): boolean {
    return this.provider === other.provider && this.subject === other.subject;
  }
}
