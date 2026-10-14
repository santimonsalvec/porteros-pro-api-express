import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { IOneTimeCodeGenerator } from '../../application/features/auth/common/ports.js';

const CODE_SPACE = 1_000_000;

/** Six digits from the cryptographic generator, zero-padded (admin spec 009, research §2). */
export class CryptoOneTimeCodeGenerator implements IOneTimeCodeGenerator {
  constructor(private readonly randomInt: (min: number, max: number) => number = cryptoRandomInt) {}

  next(): string {
    return String(this.randomInt(0, CODE_SPACE)).padStart(6, '0');
  }
}
