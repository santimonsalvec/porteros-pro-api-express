import type { IInvoicingDocumentRepository } from '../../src/application/features/invoicing/common/ports.js';
import type { InvoicingDocument, InvoicingDocumentStatus } from '../../src/domain/invoicing/invoicingDocument.js';

export class FakeInvoicingDocumentRepository implements IInvoicingDocumentRepository {
  private readonly state = new Map<string, InvoicingDocument>();

  all(): InvoicingDocument[] {
    return [...this.state.values()];
  }

  /** Stores a document as is (tests arrange states with it). */
  put(document: InvoicingDocument): void {
    this.state.set(document.id, document);
  }

  async createIfAbsent(document: InvoicingDocument): Promise<{ created: boolean; document: InvoicingDocument }> {
    const existing = this.all().find((other) => other.sourceMovementId === document.sourceMovementId);
    if (existing) return { created: false, document: existing };
    this.state.set(document.id, document);
    return { created: true, document };
  }

  async getById(id: string): Promise<InvoicingDocument | null> {
    return this.state.get(id) ?? null;
  }

  async findBySourceMovementId(movementId: string): Promise<InvoicingDocument | null> {
    return this.all().find((document) => document.sourceMovementId === movementId) ?? null;
  }

  private forGoalkeeper(goalkeeperId: string): InvoicingDocument[] {
    return this.all()
      .filter((document) => document.goalkeeperId === goalkeeperId)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id));
  }

  async listForGoalkeeper(goalkeeperId: string, skip: number, limit: number): Promise<InvoicingDocument[]> {
    return this.forGoalkeeper(goalkeeperId).slice(skip, skip + limit);
  }

  async countForGoalkeeper(goalkeeperId: string): Promise<number> {
    return this.forGoalkeeper(goalkeeperId).length;
  }

  private byStatus(status: InvoicingDocumentStatus | null): InvoicingDocument[] {
    return this.all()
      .filter((document) => status === null || document.status === status)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  }

  async listByStatus(status: InvoicingDocumentStatus | null, skip: number, limit: number): Promise<InvoicingDocument[]> {
    return this.byStatus(status).slice(skip, skip + limit);
  }

  async countByStatus(status: InvoicingDocumentStatus | null): Promise<number> {
    return this.byStatus(status).length;
  }

  private due(status: InvoicingDocumentStatus, now: Date, cap: number): InvoicingDocument[] {
    return this.all()
      .filter((document) => document.status === status && document.nextAttemptAt !== null && document.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt!.getTime() - b.nextAttemptAt!.getTime() || a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, cap);
  }

  async findDue(now: Date, cap: number): Promise<InvoicingDocument[]> {
    return this.due('pending', now, cap);
  }

  async findAwaiting(now: Date, cap: number): Promise<InvoicingDocument[]> {
    return this.due('awaiting_authority', now, cap);
  }

  async countStale(before: Date): Promise<number> {
    return this.all().filter((document) => !document.isFinal() && document.createdAt < before).length;
  }

  async update(document: InvoicingDocument, expectedStatus: InvoicingDocumentStatus): Promise<boolean> {
    const current = this.state.get(document.id);
    if (!current || current.status !== expectedStatus) return false;
    this.state.set(document.id, document);
    return true;
  }
}
