import type { IAcceptanceAuditLogger } from '../../src/application/features/goalkeeperRequests/common/ports.js';

type Entry = Parameters<IAcceptanceAuditLogger['logAcceptance']>[0];

export class FakeAcceptanceAuditLogger implements IAcceptanceAuditLogger {
  readonly entries: Entry[] = [];

  logAcceptance(entry: Entry): void {
    this.entries.push(entry);
  }
}
