import { describe, expect, it } from 'vitest';
import { DocumentType } from '../../../../../src/domain/goalkeepers/documentType.js';
import { MatchSurface } from '../../../../../src/domain/pricing/matchSurface.js';
import { SaveDocumentTypeCommand } from '../../../../../src/application/features/geography/commands/saveDocumentType/saveDocumentTypeCommand.js';
import { SaveDocumentTypeCommandHandler } from '../../../../../src/application/features/geography/commands/saveDocumentType/saveDocumentTypeCommandHandler.js';
import { DeleteDocumentTypeCommand } from '../../../../../src/application/features/geography/commands/deleteDocumentType/deleteDocumentTypeCommand.js';
import { DeleteDocumentTypeCommandHandler } from '../../../../../src/application/features/geography/commands/deleteDocumentType/deleteDocumentTypeCommandHandler.js';
import { SaveMatchSurfaceCommand } from '../../../../../src/application/features/geography/commands/saveMatchSurface/saveMatchSurfaceCommand.js';
import { SaveMatchSurfaceCommandHandler } from '../../../../../src/application/features/geography/commands/saveMatchSurface/saveMatchSurfaceCommandHandler.js';
import { DeleteMatchSurfaceCommand } from '../../../../../src/application/features/geography/commands/deleteMatchSurface/deleteMatchSurfaceCommand.js';
import { DeleteMatchSurfaceCommandHandler } from '../../../../../src/application/features/geography/commands/deleteMatchSurface/deleteMatchSurfaceCommandHandler.js';
import { ListDocumentTypesQuery } from '../../../../../src/application/features/geography/queries/listDocumentTypes/listDocumentTypesQuery.js';
import { ListDocumentTypesQueryHandler } from '../../../../../src/application/features/geography/queries/listDocumentTypes/listDocumentTypesQueryHandler.js';
import { ListMatchSurfacesQuery } from '../../../../../src/application/features/geography/queries/listMatchSurfaces/listMatchSurfacesQuery.js';
import { ListMatchSurfacesQueryHandler } from '../../../../../src/application/features/geography/queries/listMatchSurfaces/listMatchSurfacesQueryHandler.js';
import { geographyKit } from './geographyTestKit.js';

function kit() {
  const k = geographyKit();
  k.documentTypes.items.set('cc', new DocumentType({ id: 'cc', code: 'cedula_ciudadania', name: 'Cédula de ciudadanía' }));
  k.surfaces.base.surfaces.push(new MatchSurface({ id: 'synthetic_grass', name: 'Grama sintética', active: true, order: 1 }));
  return k;
}

describe('SaveDocumentTypeCommandHandler', () => {
  it('creates an invoiceable type, and warns about one invoicing would reject', async () => {
    const k = kit();
    const handler = new SaveDocumentTypeCommandHandler(k);

    expect(await handler.handle(SaveDocumentTypeCommand.create({ code: 'pasaporte', name: 'Pasaporte' }))).toEqual({ outcome: 'saved', documentTypeId: 'new-1', created: true });
    expect(await handler.handle(SaveDocumentTypeCommand.create({ code: 'tarjeta_identidad', name: 'Tarjeta' }))).toMatchObject({
      outcome: 'warnings',
      warnings: [{ code: 'document_type_not_invoiceable', data: { code: 'tarjeta_identidad' } }],
    });
    expect(await handler.handle(SaveDocumentTypeCommand.create({ code: 'tarjeta_identidad', name: 'Tarjeta' }, true))).toMatchObject({ outcome: 'saved' });
  });

  it('refuses a taken code, and a code change while goalkeepers use it', async () => {
    const k = kit();
    const handler = new SaveDocumentTypeCommandHandler(k);
    expect(await handler.handle(SaveDocumentTypeCommand.create({ code: 'cedula_ciudadania', name: 'Otra' }))).toEqual({ outcome: 'document_type_code_taken' });

    k.usage.use('cedula_ciudadania', 'document_type_in_use');
    expect(await handler.handle(SaveDocumentTypeCommand.edit('cc', 0, { code: 'CC' }))).toEqual({ outcome: 'document_type_code_in_use' });
    expect(await handler.handle(SaveDocumentTypeCommand.edit('cc', 0, { name: 'Cédula' }))).toMatchObject({ outcome: 'saved' });
  });
});

describe('SaveMatchSurfaceCommandHandler', () => {
  it('creates a surface, and asks a reason to deactivate one', async () => {
    const k = kit();
    const handler = new SaveMatchSurfaceCommandHandler(k);

    expect(await handler.handle(SaveMatchSurfaceCommand.create({ name: 'Arena', active: true, order: 6 }))).toEqual({ outcome: 'saved', surfaceId: 'new-1', created: true });
    expect(await handler.handle(SaveMatchSurfaceCommand.edit('synthetic_grass', 0, { active: false }))).toEqual({ outcome: 'reason_required' });
    expect(await handler.handle(SaveMatchSurfaceCommand.edit('synthetic_grass', 0, { active: false }, 'Ya no se ofrece'))).toMatchObject({ outcome: 'saved' });
    expect(await handler.handle(SaveMatchSurfaceCommand.edit('synthetic_grass', 0, { name: 'X' }))).toEqual({ outcome: 'stale' });
  });
});

describe('deleting catalog entries', () => {
  it('a document type by the code goalkeepers store, and a surface by its id', async () => {
    const k = kit();
    k.usage.use('cedula_ciudadania', 'document_type_in_use').use('synthetic_grass', 'surface_in_use');

    expect(await new DeleteDocumentTypeCommandHandler(k).handle(new DeleteDocumentTypeCommand('cc'))).toEqual({ outcome: 'in_use', reason: 'document_type_in_use' });
    expect(await new DeleteMatchSurfaceCommandHandler(k).handle(new DeleteMatchSurfaceCommand('synthetic_grass'))).toEqual({ outcome: 'in_use', reason: 'surface_in_use' });
    k.usage.reasons.clear();
    expect(await new DeleteDocumentTypeCommandHandler(k).handle(new DeleteDocumentTypeCommand('cc'))).toEqual({ outcome: 'deleted' });
    expect(await new DeleteMatchSurfaceCommandHandler(k).handle(new DeleteMatchSurfaceCommand('synthetic_grass'))).toEqual({ outcome: 'deleted' });
  });
});

describe('catalog views', () => {
  it('say whether a type can be invoiced and whether it is in use', async () => {
    const k = kit();
    k.usage.use('cedula_ciudadania', 'document_type_in_use');
    const page = await new ListDocumentTypesQueryHandler(k).handle(new ListDocumentTypesQuery({}, 1, 20));
    expect(page.items).toEqual([{ id: 'cc', code: 'cedula_ciudadania', name: 'Cédula de ciudadanía', invoiceable: true, inUse: true, revision: 0 }]);
  });

  it('say whether a surface is in use', async () => {
    const k = kit();
    const page = await new ListMatchSurfacesQueryHandler(k).handle(new ListMatchSurfacesQuery({ active: true }, 1, 20));
    expect(page.items).toEqual([{ id: 'synthetic_grass', name: 'Grama sintética', active: true, order: 1, inUse: false, revision: 0 }]);
  });
});
