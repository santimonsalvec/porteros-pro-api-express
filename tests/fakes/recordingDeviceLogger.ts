import type { IDeviceLogger } from '../../src/application/features/devices/common/ports.js';

/** Keeps every log entry, so tests can assert on outcomes and that no raw token was logged. */
export class RecordingDeviceLogger implements IDeviceLogger {
  readonly entries: Array<{ level: 'info' | 'warn' | 'error'; entry: Record<string, unknown>; message: string }> = [];

  info(entry: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'info', entry, message });
  }

  warn(entry: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'warn', entry, message });
  }

  error(entry: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'error', entry, message });
  }

  outcomes(): unknown[] {
    return this.entries.map((item) => item.entry.outcome);
  }

  /** Everything logged, serialized — to check a token never appears in it (FR-022). */
  serialized(): string {
    return JSON.stringify(this.entries, (_key, value) => (value instanceof Error ? value.message : value));
  }
}
