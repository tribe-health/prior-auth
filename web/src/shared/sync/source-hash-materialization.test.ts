import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

import { writeChunk } from './chunk-writer';
import {
  PGLITE_CURRENT_SCHEMA_SQL,
} from './pglite-schema';
import {
  REPLICA_LIST_BINDINGS,
  REPLICA_TABLE_BINDINGS,
  REPLICA_TARGETS,
} from './replica-wiring';

const SOURCE_HASH = '496afdb0202aaac74f27f434d43a2926d24886386cf51935b43bc91cb82f3e08';

describe('document status materialization', () => {
  it('stores the exact approved status row and structurally drops local source data', async () => {
    const database = new PGlite();
    try {
      await database.waitReady;
      await database.exec(PGLITE_CURRENT_SCHEMA_SQL);
      const target = REPLICA_TARGETS.find(({ table }) => table === 'document_statuses');
      expect(target).toBeDefined();

      await writeChunk(database, target!, [{
        id: '00000000-0000-0000-0000-000000000001',
        case_id: '00000000-0000-0000-0000-000000000004',
        document_type_id: '00000000-0000-0000-0000-000000000003',
        name: 'Synthetic MRI',
        effective_date: '2026-03-14',
        content_sha256_text: SOURCE_HASH,
        page_count: 2,
        processing_status: 'ready',
        processing_error_code: null,
        updated_at: '2026-03-15T12:00:00Z',
        revision: 3,
        practice_id: '00000000-0000-0000-0000-000000000002',
        storage_uri: 'object://must-not-land',
        text: 'must not land',
        embedding: [0.1, 0.2],
      }]);

      const result = await database.query<Record<string, unknown>>(
        'SELECT * FROM document_statuses',
      );
      expect(result.rows[0]).toMatchObject({
        content_sha256_text: SOURCE_HASH,
        processing_status: 'ready',
        revision: 3,
      });
      expect(Object.keys(result.rows[0] ?? {}).sort()).toEqual([
        'case_id',
        'content_sha256_text',
        'document_type_id',
        'effective_date',
        'id',
        'name',
        'page_count',
        'processing_error_code',
        'processing_status',
        'revision',
        'updated_at',
      ]);
      expect(REPLICA_TABLE_BINDINGS).toContainEqual({
        table: 'document_statuses',
        type: 'DocumentStatus',
        primaryKey: 'id',
      });
      expect(REPLICA_LIST_BINDINGS).toContainEqual({
        key: 'replica:document_statuses',
        table: 'document_statuses',
      });
    } finally {
      await database.close();
    }
  });
});
