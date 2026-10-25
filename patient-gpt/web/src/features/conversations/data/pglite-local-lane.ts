// TJ-ARCH-MOB-001 compliant
// Browser local lane on PGlite (IndexedDB `idb://patientgpt`). The database is
// opened through one coalesced promise, so concurrent first callers share a
// single open and a single schema migration. PGlite is loaded lazily to keep
// its WebAssembly out of the shell's first paint.
import type { PGlite } from '@electric-sql/pglite'
import type { ConversationScope } from '../../../app/transport/dto'
import { scopeKey } from '../domain/scope'
import type { LocalLaneStore } from './local-lane-store'

const DATA_DIR = 'idb://patientgpt'

const SCHEMA = `
create table if not exists local_conversation (
  id text primary key,
  scope_key text not null,
  scope jsonb not null,
  title text not null,
  updated_at text not null,
  privacy_class text not null default 'local' check (privacy_class = 'local')
);
create index if not exists local_conversation_scope on local_conversation (scope_key, updated_at desc);
create table if not exists composer_draft (
  scope_key text primary key,
  body text not null,
  updated_at text not null,
  privacy_class text not null default 'local' check (privacy_class = 'local')
);
`

let opening: Promise<PGlite> | null = null

function open(): Promise<PGlite> {
  opening ??= (async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const db = await PGlite.create(DATA_DIR)
    await db.exec(SCHEMA)
    return db
  })()
  return opening
}

type ConversationRow = { id: string; scope: ConversationScope; title: string; updated_at: string }

export function createPgliteLocalLane(): LocalLaneStore {
  return {
    kind: 'pglite',
    async listConversations(key) {
      const db = await open()
      const res = await db.query<ConversationRow>(
        'select id, scope, title, updated_at from local_conversation where scope_key = $1 order by updated_at desc',
        [key],
      )
      return res.rows.map((r) => ({ id: r.id, scope: r.scope, title: r.title, updatedAt: r.updated_at }))
    },
    async putConversations(rows) {
      if (rows.length === 0) return
      const db = await open()
      await db.transaction(async (tx) => {
        for (const r of rows) {
          await tx.query(
            `insert into local_conversation (id, scope_key, scope, title, updated_at)
             values ($1, $2, $3, $4, $5)
             on conflict (id) do update set scope_key = excluded.scope_key, scope = excluded.scope,
               title = excluded.title, updated_at = excluded.updated_at`,
            [r.id, scopeKey(r.scope), JSON.stringify(r.scope), r.title, r.updatedAt],
          )
        }
      })
    },
    async readDraft(key) {
      const db = await open()
      const res = await db.query<{ body: string }>('select body from composer_draft where scope_key = $1', [key])
      return res.rows[0]?.body ?? ''
    },
    async writeDraft(key, body) {
      const db = await open()
      if (body === '') {
        await db.query('delete from composer_draft where scope_key = $1', [key])
        return
      }
      await db.query(
        `insert into composer_draft (scope_key, body, updated_at) values ($1, $2, $3)
         on conflict (scope_key) do update set body = excluded.body, updated_at = excluded.updated_at`,
        [key, body, new Date().toISOString()],
      )
    },
  }
}
