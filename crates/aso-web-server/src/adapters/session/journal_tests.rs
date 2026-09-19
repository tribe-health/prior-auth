//! Run through scripts/test-ra06c-logout-journal.py against its disposable DB.

use super::journal::PgLogoutJournal;
use aso_host::{
    logout::{LogoutClaimOutcome, LogoutJournal},
    session::{AuthenticatedIdentity, Principal, SessionDenialRepository},
};
use chrono::{Duration, Utc};
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use uuid::Uuid;

#[tokio::test]
#[ignore = "requires isolated fixture: RUSTUP_TOOLCHAIN=1.97.1 python3 scripts/test-ra06c-logout-journal.py"]
async fn logout_journal_lease_lifecycle() {
    let runtime_url = std::env::var("ASO_TEST_LOGOUT_DATABASE_URL")
        .expect("restricted disposable database required");
    let admin_url =
        std::env::var("ASO_TEST_ADMIN_DATABASE_URL").expect("admin fixture URL required");
    let journal = Arc::new(
        PgLogoutJournal::connect(&runtime_url)
            .await
            .expect("restricted journal"),
    );
    let admin = PgPoolOptions::new()
        .max_connections(1)
        .connect(&admin_url)
        .await
        .expect("admin observation pool");
    let runtime = PgPoolOptions::new()
        .max_connections(1)
        .connect(&runtime_url)
        .await
        .expect("runtime refusal pool");

    let now = Utc::now();
    let identity = AuthenticatedIdentity {
        identity_id: Uuid::new_v4(),
        session_id: Uuid::new_v4(),
        issuer: "https://identity.synthetic.invalid/".into(),
        principal: Principal::User,
        expires_at: now + Duration::hours(1),
    };
    let first_token = Uuid::new_v4();
    let first = journal
        .deny_and_claim(&identity, now, first_token, now + Duration::seconds(5))
        .await
        .expect("commit denial and claim");
    let LogoutClaimOutcome::Claimed(first_claim) = first else {
        panic!("new denial must be claimed")
    };
    assert_eq!(first_claim.kratos_session_id, identity.session_id);
    assert_eq!(first_claim.kratos_issuer, identity.issuer);
    assert_eq!(first_claim.lease_token, first_token);
    println!("logout_journal_check: denial_committed_before_effect");

    assert!(
        journal
            .is_denied(&identity, now)
            .await
            .expect("matching denial predicate")
    );
    let mut foreign = identity.clone();
    foreign.issuer = "https://foreign-identity.synthetic.invalid/".into();
    assert!(
        !journal
            .is_denied(&foreign, now)
            .await
            .expect("foreign issuer predicate")
    );
    foreign.issuer.clone_from(&identity.issuer);
    foreign.session_id = Uuid::new_v4();
    assert!(
        !journal
            .is_denied(&foreign, now)
            .await
            .expect("foreign session predicate")
    );
    assert!(
        !journal
            .is_denied(&identity, identity.expires_at + Duration::seconds(1))
            .await
            .expect("elapsed retention predicate")
    );
    println!("logout_journal_check: denial_predicate_is_tuple_scoped_and_bounded");

    assert_eq!(
        journal
            .deny_and_claim(
                &identity,
                now + Duration::milliseconds(1),
                Uuid::new_v4(),
                now + Duration::seconds(5),
            )
            .await,
        Ok(LogoutClaimOutcome::Pending)
    );
    let mut wrong_lease = first_claim.clone();
    wrong_lease.lease_token = Uuid::new_v4();
    assert!(
        !journal
            .confirm(&wrong_lease, now + Duration::seconds(1))
            .await
            .expect("wrong lease refusal")
    );
    println!("logout_journal_check: concurrent_and_wrong_lease_refused");

    assert!(
        journal
            .claim_next(
                now + Duration::seconds(4),
                Uuid::new_v4(),
                now + Duration::seconds(9),
            )
            .await
            .expect("live lease probe")
            .is_none()
    );
    let recovered = journal
        .claim_next(
            now + Duration::seconds(5),
            Uuid::new_v4(),
            now + Duration::seconds(10),
        )
        .await
        .expect("expired lease recovery probe")
        .expect("expired lease claim");
    assert!(
        journal
            .confirm(&recovered, now + Duration::seconds(6))
            .await
            .expect("confirm recovered lease")
    );
    assert_eq!(
        journal
            .deny_and_claim(
                &identity,
                now + Duration::seconds(7),
                Uuid::new_v4(),
                now + Duration::seconds(12),
            )
            .await,
        Ok(LogoutClaimOutcome::Confirmed)
    );
    println!("logout_journal_check: expired_lease_recovery_confirmed");

    let retry_identity = AuthenticatedIdentity {
        identity_id: identity.identity_id,
        session_id: Uuid::new_v4(),
        issuer: identity.issuer.clone(),
        principal: identity.principal,
        expires_at: identity.expires_at,
    };
    let retry_claim = match journal
        .deny_and_claim(
            &retry_identity,
            now + Duration::seconds(7),
            Uuid::new_v4(),
            now + Duration::seconds(12),
        )
        .await
        .expect("commit retry denial")
    {
        LogoutClaimOutcome::Claimed(claim) => claim,
        _ => panic!("new retry denial must be claimed"),
    };
    assert!(
        journal
            .retry(
                &retry_claim,
                now + Duration::seconds(8),
                now + Duration::seconds(9),
                "synthetic_unavailable",
            )
            .await
            .expect("schedule retry")
    );
    assert!(
        journal
            .claim_next(
                now + Duration::seconds(8),
                Uuid::new_v4(),
                now + Duration::seconds(13),
            )
            .await
            .expect("early retry probe")
            .is_none()
    );
    let due_at = now + Duration::seconds(9);
    let first_racer = Arc::clone(&journal);
    let second_racer = Arc::clone(&journal);
    let first_racer_token = Uuid::new_v4();
    let second_racer_token = Uuid::new_v4();
    let (first_race, second_race) = tokio::join!(
        first_racer.claim_next(due_at, first_racer_token, now + Duration::seconds(14),),
        second_racer.claim_next(due_at, second_racer_token, now + Duration::seconds(14),)
    );
    let mut won_claims = [
        first_race.expect("first due retry racer"),
        second_race.expect("second due retry racer"),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>();
    assert_eq!(won_claims.len(), 1);
    let retried = won_claims.pop().expect("one due retry owner");
    assert!(retried.lease_token == first_racer_token || retried.lease_token == second_racer_token);
    println!("logout_journal_check: due_retry_race_has_one_lease_owner");
    assert!(
        journal
            .confirm(&retried, now + Duration::seconds(10))
            .await
            .expect("confirm retried lease")
    );
    println!("logout_journal_check: retry_schedule_respected");

    let stale_identity = AuthenticatedIdentity {
        identity_id: identity.identity_id,
        session_id: Uuid::new_v4(),
        issuer: identity.issuer.clone(),
        principal: identity.principal,
        expires_at: identity.expires_at,
    };
    let stale_claim = match journal
        .deny_and_claim(
            &stale_identity,
            now + Duration::seconds(10),
            Uuid::new_v4(),
            now + Duration::seconds(12),
        )
        .await
        .expect("commit stale-owner denial")
    {
        LogoutClaimOutcome::Claimed(claim) => claim,
        _ => panic!("new stale-owner denial must be claimed"),
    };
    assert!(
        !journal
            .retry(
                &stale_claim,
                now + Duration::seconds(13),
                now + Duration::seconds(14),
                "synthetic_stalled_worker",
            )
            .await
            .expect("expired retry owner refusal")
    );
    let stale_row_unchanged: bool = sqlx::query_scalar(
        "SELECT lease_token = $3 AND lease_expires_at = $4
                AND next_attempt_at = $5 AND last_error_code IS NULL
           FROM aso.session_denials
          WHERE kratos_issuer = $1 AND kratos_session_id = $2",
    )
    .bind(&stale_identity.issuer)
    .bind(stale_identity.session_id.to_string())
    .bind(stale_claim.lease_token)
    .bind(stale_claim.lease_expires_at)
    .bind(now + Duration::seconds(10))
    .fetch_one(&admin)
    .await
    .expect("observe unchanged stale-owner row");
    assert!(stale_row_unchanged);
    println!("logout_journal_check: expired_owner_cannot_schedule_retry");

    let state: (String, i64, bool, bool, bool) = sqlx::query_as(
        "SELECT confirmation_state, attempt_count,
                retain_until = session_expires_at + skew_allowance,
                lease_token IS NULL AND lease_expires_at IS NULL,
                confirmed_at IS NOT NULL AND next_attempt_at IS NULL
           FROM aso.session_denials
          WHERE kratos_issuer = $1 AND kratos_session_id = $2",
    )
    .bind(&retry_identity.issuer)
    .bind(retry_identity.session_id.to_string())
    .fetch_one(&admin)
    .await
    .expect("observe journal row");
    assert_eq!(state, ("confirmed".into(), 2, true, true, true));
    let events: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM aso.authority_outbox
          WHERE event_type = 'session_denied' AND kratos_issuer = $1
            AND kratos_session_id = $2",
    )
    .bind(&identity.issuer)
    .bind(identity.session_id.to_string())
    .fetch_one(&admin)
    .await
    .expect("observe authority event");
    assert_eq!(events, 1);
    println!("logout_journal_check: one_durable_event_and_exact_retention");

    assert!(
        sqlx::query("DELETE FROM aso.session_denials")
            .execute(&runtime)
            .await
            .is_err()
    );
    assert!(
        sqlx::query("SELECT count(*) FROM aso.authority_outbox")
            .fetch_one(&runtime)
            .await
            .is_err()
    );
    println!("logout_journal_check: runtime_role_is_least_privilege");
}
