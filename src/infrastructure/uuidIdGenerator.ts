import { v7 as uuidv7 } from 'uuid';
import type { IIdGenerator } from '../application/features/auth/common/ports.js';

export class UuidIdGenerator implements IIdGenerator {
  newId(): string {
    return uuidv7();
  }
}
