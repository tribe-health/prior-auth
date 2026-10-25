// TJ-ARCH-MOB-001 compliant
//! Embedded SurrealDB 3.3.0 conversation store (RocksDB engine).
//!
//! RocksDB takes an exclusive lock on its directory, so the engine is opened
//! once through a coalesced `OnceCell::get_or_try_init`: concurrent first
//! callers await the same open instead of racing two engines onto one lock.
//! Records here are privacy class `local`; this store never syncs.

use std::path::PathBuf;

use async_trait::async_trait;
use patient_gpt_domain::{ConversationScope, ConversationSummary};
use patient_gpt_host::{ConversationStore, HostError};
use surrealdb::Surreal;
use surrealdb::engine::local::{Db, RocksDb};
use surrealdb::types::SurrealValue;
use tokio::sync::OnceCell;

const NAMESPACE: &str = "patientgpt";
const DATABASE: &str = "local";

const SCHEMA: &str = "
DEFINE TABLE IF NOT EXISTS conversation SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS conversation_id ON conversation TYPE string;
DEFINE FIELD IF NOT EXISTS scope ON conversation TYPE string;
DEFINE FIELD IF NOT EXISTS title ON conversation TYPE string;
DEFINE FIELD IF NOT EXISTS updated_at ON conversation TYPE string;
DEFINE INDEX IF NOT EXISTS conversation_scope ON conversation FIELDS scope;
";

const LIST: &str = "SELECT conversation_id, scope, title, updated_at FROM conversation \
                    WHERE scope = $scope ORDER BY updated_at DESC";
const GET: &str = "SELECT conversation_id, scope, title, updated_at FROM conversation \
                   WHERE conversation_id = $conversation_id LIMIT 1";
const PUT: &str = "UPSERT type::record('conversation', $conversation_id) SET \
                   conversation_id = $conversation_id, scope = $scope, \
                   title = $title, updated_at = $updated_at";

/// Stored shape. `scope` uses the query-string form so equality is a plain
/// string comparison.
#[derive(Debug, Clone, SurrealValue)]
#[surreal(crate = "surrealdb::types")]
struct ConversationRecord {
    conversation_id: String,
    scope: String,
    title: String,
    updated_at: String,
}

#[derive(Debug, Clone, SurrealValue)]
#[surreal(crate = "surrealdb::types")]
struct ScopeParam {
    scope: String,
}

#[derive(Debug, Clone, SurrealValue)]
#[surreal(crate = "surrealdb::types")]
struct IdParam {
    conversation_id: String,
}

impl From<ConversationSummary> for ConversationRecord {
    fn from(summary: ConversationSummary) -> Self {
        Self {
            conversation_id: summary.id,
            scope: summary.scope.to_string(),
            title: summary.title,
            updated_at: summary.updated_at,
        }
    }
}

impl TryFrom<ConversationRecord> for ConversationSummary {
    type Error = HostError;

    fn try_from(record: ConversationRecord) -> Result<Self, Self::Error> {
        let scope: ConversationScope = record.scope.parse().map_err(|err| {
            HostError::Storage(format!("stored conversation has an invalid scope: {err}"))
        })?;
        Ok(Self {
            id: record.conversation_id,
            scope,
            title: record.title,
            updated_at: record.updated_at,
        })
    }
}

fn storage(err: surrealdb::Error) -> HostError {
    HostError::Storage(err.to_string())
}

/// Opened lazily on first use; every later call reuses the same engine.
#[derive(Debug)]
pub struct SurrealConversationStore {
    path: PathBuf,
    db: OnceCell<Surreal<Db>>,
}

impl SurrealConversationStore {
    /// `path` is the RocksDB directory. Nothing is opened until first use.
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            db: OnceCell::new(),
        }
    }

    async fn db(&self) -> Result<&Surreal<Db>, HostError> {
        self.db
            .get_or_try_init(|| async {
                let db = Surreal::new::<RocksDb>(self.path.clone())
                    .await
                    .map_err(storage)?;
                db.use_ns(NAMESPACE)
                    .use_db(DATABASE)
                    .await
                    .map_err(storage)?;
                db.query(SCHEMA)
                    .await
                    .map_err(storage)?
                    .check()
                    .map_err(storage)?;
                Ok(db)
            })
            .await
    }
}

#[async_trait]
impl ConversationStore for SurrealConversationStore {
    async fn list(&self, scope: &ConversationScope) -> Result<Vec<ConversationSummary>, HostError> {
        let mut response = self
            .db()
            .await?
            .query(LIST)
            .bind(ScopeParam {
                scope: scope.to_string(),
            })
            .await
            .map_err(storage)?;
        let records: Vec<ConversationRecord> = response.take(0).map_err(storage)?;
        records
            .into_iter()
            .map(ConversationSummary::try_from)
            .collect()
    }

    async fn get(&self, id: &str) -> Result<Option<ConversationSummary>, HostError> {
        let mut response = self
            .db()
            .await?
            .query(GET)
            .bind(IdParam {
                conversation_id: id.to_owned(),
            })
            .await
            .map_err(storage)?;
        let record: Option<ConversationRecord> = response.take(0).map_err(storage)?;
        record.map(ConversationSummary::try_from).transpose()
    }

    async fn put(&self, conversation: ConversationSummary) -> Result<(), HostError> {
        self.db()
            .await?
            .query(PUT)
            .bind(ConversationRecord::from(conversation))
            .await
            .map_err(storage)?
            .check()
            .map_err(storage)?;
        Ok(())
    }
}
