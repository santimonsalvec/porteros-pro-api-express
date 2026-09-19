/**
 * Claims carried by every internal access JWT. `isAdmin`/`profileComplete`/`isGoalkeeper` use the
 * string-boolean convention ("true"/"false"), mirroring the source system exactly —
 * see contracts/token-claims.md.
 */
export interface AccessTokenClaims {
  sub: string;
  email: string;
  isAdmin: 'true' | 'false';
  profileComplete: 'true' | 'false';
  /** Present (as `"true"`) only for a client with an active goalkeeper profile; omitted otherwise. */
  isGoalkeeper?: 'true';
}
