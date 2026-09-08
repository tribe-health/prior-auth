//! Run only through scripts/test-session-context.py, against its disposable DB.

use super::*;

type ConnectionState = (i32, bool, String, String, String, String, String);

async fn state(pool: &PgPool) -> ConnectionState {
    sqlx::query_as(
        "SELECT pg_backend_pid(), current_user = session_user,
        COALESCE(current_setting('aso.kratos_identity_id', true), ''),
        current_setting('search_path'), current_setting('statement_timeout'),
        current_setting('transaction_read_only'), current_setting('transaction_isolation')",
    )
    .fetch_one(pool)
    .await
    .expect("read connection state")
}

async fn assert_clean(pool: &PgPool, baseline: &ConnectionState, label: &str) {
    let actual = tokio::time::timeout(Duration::from_secs(15), state(pool))
        .await
        .expect("connection must become reusable after transaction exit");
    // Includes PID: a replacement connection cannot disguise leaked settings.
    assert_eq!(&actual, baseline, "connection context leaked after {label}");
    println!("context check passed: {label}");
}

#[tokio::test]
#[ignore = "requires isolated fixture: RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-session-context.py"]
async fn session_transaction_context_lifecycle() {
    let url = std::env::var("ASO_TEST_DATABASE_URL").expect("disposable DB required");
    let identity = AuthenticatedIdentity {
        identity_id: std::env::var("ASO_TEST_IDENTITY_ID")
            .unwrap()
            .parse()
            .unwrap(),
        session_id: Uuid::new_v4(),
        principal: aso_host::session::Principal::User,
        expires_at: Utc::now() + chrono::Duration::minutes(5),
    };
    let practice: Uuid = std::env::var("ASO_TEST_PRACTICE_ID")
        .unwrap()
        .parse()
        .unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(1)
        .acquire_timeout(Duration::from_secs(15))
        .connect(&url)
        .await
        .expect("connect restricted disposable login");
    let repo = Arc::new(PgMembershipRepository { pool });
    let baseline = state(&repo.pool).await;
    assert!(
        baseline.1 && baseline.2.is_empty(),
        "fixture must start unscoped"
    );

    let mut tx = repo.begin_scoped(&identity).await.unwrap();
    let scoped: (bool, String, Uuid, bool, String, String) = sqlx::query_as(
        "SELECT current_user = 'aso_session_reader',
         current_setting('aso.kratos_identity_id'), aso.current_app_user_id(),
         current_setting('transaction_read_only') = 'on',
         current_setting('transaction_isolation'), current_setting('statement_timeout')",
    )
    .fetch_one(&mut *tx)
    .await
    .unwrap();
    assert!(scoped.0 && scoped.3);
    assert_eq!(scoped.1, identity.identity_id.to_string());
    assert_eq!(
        scoped.2,
        std::env::var("ASO_TEST_USER_ID")
            .unwrap()
            .parse::<Uuid>()
            .unwrap()
    );
    assert_eq!(scoped.4, "repeatable read");
    assert_eq!(scoped.5, "5s");
    tx.commit().await.unwrap();
    assert_clean(&repo.pool, &baseline, "explicit_commit").await;

    assert_eq!(
        repo.resolve(&identity, Some(practice))
            .await
            .unwrap()
            .practice_id,
        practice
    );
    assert_clean(&repo.pool, &baseline, "mounted_repository_success").await;
    assert!(matches!(
        repo.resolve(&identity, Some(Uuid::new_v4())).await,
        Err(SessionError::PracticeDenied)
    ));
    assert_clean(&repo.pool, &baseline, "mounted_repository_denial").await;

    let mut tx = repo.begin_scoped(&identity).await.unwrap();
    let failure = sqlx::query("SELECT 1/0")
        .execute(&mut *tx)
        .await
        .unwrap_err();
    assert_eq!(
        failure.as_database_error().unwrap().code().as_deref(),
        Some("22012")
    );
    drop(tx);
    assert_clean(&repo.pool, &baseline, "sql_error_drop_rollback").await;

    let tx = repo.begin_scoped(&identity).await.unwrap();
    tx.rollback().await.unwrap();
    assert_clean(&repo.pool, &baseline, "explicit_rollback").await;

    // Observe a query actually running before cancelling its owning future.
    let observer = PgPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let task_repo = Arc::clone(&repo);
    let task = tokio::spawn(async move {
        let mut tx = task_repo.begin_scoped(&identity).await.unwrap();
        sqlx::query("SELECT pg_sleep(30)").execute(&mut *tx).await
    });
    tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            let running: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM pg_stat_activity
                WHERE pid = $1 AND state = 'active' AND wait_event = 'PgSleep')",
            )
            .bind(baseline.0)
            .fetch_one(&observer)
            .await
            .unwrap();
            if running {
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("must observe active database query before abort");
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    let mut after_cancel = tokio::time::timeout(Duration::from_secs(15), state(&repo.pool))
        .await
        .expect("cancelled connection must be cleaned or discarded");
    let replaced = after_cancel.0 != baseline.0;
    if replaced {
        // SQLx 0.8 discards a connection if its on-release ping receives the
        // interrupted query's timeout error. Prove that backend was removed.
        let old_backend_exists: bool =
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid = $1)")
                .bind(baseline.0)
                .fetch_one(&observer)
                .await
                .unwrap();
        assert!(
            !old_backend_exists,
            "interrupted backend must not survive discard"
        );
    }
    after_cancel.0 = baseline.0;
    assert_eq!(
        after_cancel, baseline,
        "next borrower must have no prior context"
    );
    println!(
        "context check passed: in_flight_cancellation_clean_or_discarded (replaced={replaced})"
    );
    observer.close().await;
    repo.pool.close().await;
}
