import { createHmac } from 'node:crypto';
import type { ILoginCodeHasher } from '../../application/features/auth/common/ports.js';
import type { LoginCodeAudience } from '../../domain/auth/loginCode.js';

/**
 * HMAC-SHA256 of the code with the server's key (admin spec 009, research §2): the database alone
 * cannot be searched for the million codes, and the product and address in the message make a code
 * of one never match the other. `v1` separates this use of `JWT_SIGNING_KEY` from the tokens.
 */
export class HmacLoginCodeHasher implements ILoginCodeHasher {
  constructor(private readonly signingKey: () => string) {}

  hash(input: { audience: LoginCodeAudience; email: string; code: string }): string {
    return createHmac('sha256', this.signingKey()).update(`login-code:v1:${input.audience}:${input.email}:${input.code}`).digest('hex');
  }
}
