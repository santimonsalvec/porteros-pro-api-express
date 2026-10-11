import type { AdminSecurityEvent, IAdminSecurityLog } from '../../src/application/features/staff/common/ports.js';

export class FakeAdminSecurityLog implements IAdminSecurityLog {
  readonly events: AdminSecurityEvent[] = [];

  log(event: AdminSecurityEvent): void {
    this.events.push(event);
  }
}
