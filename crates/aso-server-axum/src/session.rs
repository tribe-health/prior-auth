//! Credential extraction and the sanitized session operation.

pub use aso_host::session::{Principal, VerifiedSession};
use aso_host::{
    affirmation::ClinicalContext,
    domain::{ActorId, PracticeId},
    logout::LogoutResult,
    projection::ReplicaGrant,
    session::{SessionCredential, SessionError},
};
use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::ServerState;

pub(crate) enum ClinicalContextError {
    Session(SessionError),
    NonHuman,
}

pub(crate) async fn clinical_context(
    state: &ServerState,
    headers: &HeaderMap,
    practice: Option<Uuid>,
) -> Result<(ClinicalContext, Vec<String>), ClinicalContextError> {
    let raw = credential(headers).map_err(ClinicalContextError::Session)?;
    let session = state
        .services
        .sessions
        .resolve(&raw, practice)
        .await
        .map_err(ClinicalContextError::Session)?;
    if session.expires_at <= state.services.clock.now() {
        return Err(ClinicalContextError::Session(SessionError::Unauthenticated));
    }
    if session.principal != Principal::User {
        return Err(ClinicalContextError::NonHuman);
    }
    Ok((
        ClinicalContext {
            identity_id: session.identity_id,
            actor: ActorId(session.user_id),
            practice: PracticeId(session.practice_id),
            principal: session.principal,
            expires_at: session.expires_at,
        },
        session.capabilities,
    ))
}

/// Resolves the narrow internal service identity used by background jobs.
/// Human and delegated-agent credentials are refused before a job reaches
/// AppServices; the database independently verifies the exact job grant.
pub(crate) async fn service_context(
    state: &ServerState,
    headers: &HeaderMap,
    practice: Option<Uuid>,
) -> Result<(ClinicalContext, Vec<String>), ClinicalContextError> {
    let raw = credential(headers).map_err(ClinicalContextError::Session)?;
    let session = state
        .services
        .sessions
        .resolve(&raw, practice)
        .await
        .map_err(ClinicalContextError::Session)?;
    if session.expires_at <= state.services.clock.now() {
        return Err(ClinicalContextError::Session(SessionError::Unauthenticated));
    }
    if session.principal != Principal::Service {
        return Err(ClinicalContextError::NonHuman);
    }
    Ok((
        ClinicalContext {
            identity_id: session.identity_id,
            actor: ActorId(session.user_id),
            practice: PracticeId(session.practice_id),
            principal: session.principal,
            expires_at: session.expires_at,
        },
        session.capabilities,
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SessionQuery {
    practice_id: Option<Uuid>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplicaGrantQuery {
    practice_id: Option<Uuid>,
}

pub fn router() -> Router<ServerState> {
    Router::new()
        .route("/api/session", get(current_session).delete(logout))
        .route("/api/session/replica-grant", get(replica_grant))
}

async fn logout(State(state): State<ServerState>, headers: HeaderMap) -> Response {
    let response = match credential(&headers) {
        Err(error) => session_error(error),
        Ok(credential) => match state.services.sessions.logout(&credential).await {
            Ok(LogoutResult::Confirmed) => StatusCode::NO_CONTENT.into_response(),
            Ok(LogoutResult::DeniedPending) => (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "logout_incomplete"})),
            )
                .into_response(),
            Err(error) => session_error(error),
        },
    };
    private_response_headers(response)
}

pub(crate) fn credential(headers: &HeaderMap) -> Result<SessionCredential, SessionError> {
    // Reject ambiguous credential sources so the gateway and service cannot
    // authenticate different identities from the same request.
    let mut values = Vec::new();
    for name in [
        header::AUTHORIZATION.as_str(),
        "x-session-token",
        header::COOKIE.as_str(),
    ] {
        let all = headers.get_all(name);
        if all.iter().count() > 1 {
            return Err(SessionError::Unauthenticated);
        }
        if let Some(value) = all.iter().next() {
            let value = value.to_str().map_err(|_| SessionError::Unauthenticated)?;
            if value.is_empty() || value.bytes().all(|byte| byte.is_ascii_whitespace()) {
                return Err(SessionError::Unauthenticated);
            }
            values.push((name, value));
        }
    }
    if values.len() != 1 {
        return Err(SessionError::Unauthenticated);
    }
    let (name, value) = values[0];
    if name == "cookie"
        && value
            .split(';')
            .filter(|pair| {
                pair.trim()
                    .split_once('=')
                    .is_some_and(|(key, _)| key.trim() == "ory_kratos_session")
            })
            .count()
            > 1
    {
        return Err(SessionError::Unauthenticated);
    }
    match name {
        "cookie" => Ok(SessionCredential::Cookie(value.to_owned())),
        "x-session-token" => Ok(SessionCredential::NativeToken(value.to_owned())),
        _ => {
            let (scheme, token) = value.split_once(' ').ok_or(SessionError::Unauthenticated)?;
            if !scheme.eq_ignore_ascii_case("bearer")
                || token.is_empty()
                || token.bytes().any(|b| b.is_ascii_whitespace())
            {
                return Err(SessionError::Unauthenticated);
            }
            Ok(SessionCredential::NativeToken(token.to_owned()))
        }
    }
}

async fn current_session(
    State(state): State<ServerState>,
    headers: HeaderMap,
    query: Result<Query<SessionQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    let response = match query {
        Err(_) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_session_request"})),
        )
            .into_response(),
        Ok(Query(query)) => match credential(&headers) {
            Err(error) => session_error(error),
            Ok(credential) => match state
                .services
                .sessions
                .resolve(&credential, query.practice_id)
                .await
            {
                Ok(summary) if summary.expires_at <= state.services.clock.now() => {
                    session_error(SessionError::Unauthenticated)
                }
                Ok(summary) if summary.principal != Principal::User => {
                    session_error(SessionError::PracticeDenied)
                }
                Ok(summary) => Json(summary).into_response(),
                Err(error) => session_error(error),
            },
        },
    };
    private_response_headers(response)
}

async fn replica_grant(
    State(state): State<ServerState>,
    headers: HeaderMap,
    query: Result<Query<ReplicaGrantQuery>, axum::extract::rejection::QueryRejection>,
) -> Response {
    let response = match query {
        Err(_) => (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "invalid_projection_request"})),
        )
            .into_response(),
        Ok(Query(query)) => match credential(&headers) {
            Err(error) => session_error(error),
            Ok(credential) => match state
                .services
                .sessions
                .resolve(&credential, query.practice_id)
                .await
            {
                Ok(summary) if summary.expires_at <= state.services.clock.now() => {
                    session_error(SessionError::Unauthenticated)
                }
                Ok(summary) if summary.principal != Principal::User => {
                    session_error(SessionError::PracticeDenied)
                }
                Ok(summary) => Json(ReplicaGrant::for_session(&summary)).into_response(),
                Err(error) => session_error(error),
            },
        },
    };
    private_response_headers(response)
}

fn private_response_headers(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    response.headers_mut().insert(
        header::VARY,
        "Cookie, Authorization, X-Session-Token".parse().unwrap(),
    );
    response
}

pub(crate) fn session_error(error: SessionError) -> Response {
    let (status, code) = match error {
        SessionError::Unauthenticated => (StatusCode::UNAUTHORIZED, "unauthenticated"),
        SessionError::ReauthenticationRequired => {
            (StatusCode::FORBIDDEN, "reauthentication_required")
        }
        SessionError::PracticeDenied => (StatusCode::FORBIDDEN, "practice_denied"),
        SessionError::Unavailable | SessionError::NativeAuthenticationUnavailable => {
            (StatusCode::SERVICE_UNAVAILABLE, "session_unavailable")
        }
    };
    (status, Json(json!({"error": code}))).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;
    use aso_host::{
        AppServices,
        domain::*,
        ports::*,
        session::{
            AuthenticatedIdentity, IdentityProvider, IdentityRevalidation, InactiveSessionObserver,
            Membership, MembershipRepository, SessionContinuity, SessionCredential,
            SessionDenialRepository, SessionError, SessionPort, SessionService, SessionSummary,
        },
    };
    use async_trait::async_trait;
    use axum::{
        body::{Body, to_bytes},
        http::Request,
    };
    use chrono::{DateTime, Duration, Utc};
    use std::sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };
    use tower::ServiceExt;

    #[test]
    fn an_agent_may_not_attempt_a_clinical_act() {
        for principal in [Principal::User, Principal::Agent, Principal::Service] {
            let session = VerifiedSession {
                actor: ActorId(Uuid::nil()),
                practice: PracticeId(Uuid::nil()),
                principal,
                on_behalf_of: None,
            };
            assert_eq!(
                session.may_attempt_clinical_act(),
                principal == Principal::User
            );
        }
    }

    #[test]
    fn ambiguous_or_blank_credentials_are_rejected_before_resolution() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            "ory_kratos_session=first; ory_kratos_session =second"
                .parse()
                .unwrap(),
        );
        assert!(matches!(
            credential(&headers),
            Err(SessionError::Unauthenticated)
        ));

        headers.clear();
        headers.insert("x-session-token", "   ".parse().unwrap());
        assert!(matches!(
            credential(&headers),
            Err(SessionError::Unauthenticated)
        ));
    }

    fn now() -> DateTime<Utc> {
        "2026-09-08T12:00:00Z".parse().unwrap()
    }

    struct GrantSessions {
        calls: AtomicUsize,
    }

    struct ActiveIdentity;

    #[async_trait]
    impl IdentityProvider for ActiveIdentity {
        async fn authenticate(
            &self,
            _: &SessionCredential,
        ) -> Result<AuthenticatedIdentity, SessionError> {
            Ok(AuthenticatedIdentity {
                identity_id: Uuid::from_u128(1),
                session_id: Uuid::from_u128(3),
                issuer: "https://identity.example.test/".into(),
                principal: Principal::User,
                expires_at: now() + Duration::hours(1),
            })
        }
    }

    struct RevokedAfterFirstValidation;

    #[async_trait]
    impl IdentityProvider for RevokedAfterFirstValidation {
        async fn authenticate(
            &self,
            _: &SessionCredential,
        ) -> Result<AuthenticatedIdentity, SessionError> {
            ActiveIdentity
                .authenticate(&SessionCredential::NativeToken(String::new()))
                .await
        }

        async fn revalidate(
            &self,
            _: &SessionCredential,
            _: &AuthenticatedIdentity,
        ) -> Result<IdentityRevalidation, SessionError> {
            Ok(IdentityRevalidation::Inactive)
        }
    }

    struct AllowedMemberships {
        calls: AtomicUsize,
    }

    #[async_trait]
    impl MembershipRepository for AllowedMemberships {
        async fn resolve(
            &self,
            _: &AuthenticatedIdentity,
            practice: Option<Uuid>,
        ) -> Result<Membership, SessionError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Ok(Membership {
                user_id: Uuid::from_u128(2),
                practice_id: practice.ok_or(SessionError::PracticeDenied)?,
                display_name: "Synthetic Revocation User".into(),
                capabilities: vec![],
                authorization_revision: "synthetic:1".into(),
            })
        }
    }

    struct ObservedDenial {
        denied: AtomicBool,
        observations: AtomicUsize,
    }

    #[async_trait]
    impl SessionDenialRepository for ObservedDenial {
        async fn is_denied(
            &self,
            _: &AuthenticatedIdentity,
            _: DateTime<Utc>,
        ) -> Result<bool, SessionError> {
            Ok(self.denied.load(Ordering::SeqCst))
        }
    }

    #[async_trait]
    impl InactiveSessionObserver for ObservedDenial {
        async fn observe_inactive(&self, _: &AuthenticatedIdentity) -> Result<(), SessionError> {
            self.observations.fetch_add(1, Ordering::SeqCst);
            self.denied.store(true, Ordering::SeqCst);
            Ok(())
        }
    }

    struct CountingMemberships {
        calls: AtomicUsize,
    }

    #[async_trait]
    impl MembershipRepository for CountingMemberships {
        async fn resolve(
            &self,
            _: &AuthenticatedIdentity,
            _: Option<Uuid>,
        ) -> Result<Membership, SessionError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            Err(SessionError::PracticeDenied)
        }
    }

    struct DeniedSession;

    #[async_trait]
    impl SessionDenialRepository for DeniedSession {
        async fn is_denied(
            &self,
            _: &AuthenticatedIdentity,
            _: DateTime<Utc>,
        ) -> Result<bool, SessionError> {
            Ok(true)
        }
    }

    #[async_trait]
    impl InactiveSessionObserver for DeniedSession {
        async fn observe_inactive(&self, _: &AuthenticatedIdentity) -> Result<(), SessionError> {
            Ok(())
        }
    }

    #[async_trait]
    impl SessionPort for GrantSessions {
        async fn resolve(
            &self,
            _: &SessionCredential,
            practice: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let practice_id = practice.ok_or(SessionError::PracticeDenied)?;
            if ![Uuid::from_u128(10), Uuid::from_u128(20)].contains(&practice_id) {
                return Err(SessionError::PracticeDenied);
            }
            Ok(SessionSummary {
                identity_id: Uuid::from_u128(1),
                session_id: Uuid::from_u128(3),
                user_id: Uuid::from_u128(2),
                practice_id,
                display_name: "Synthetic Registry User".into(),
                principal: Principal::User,
                capabilities: vec![],
                expires_at: now() + Duration::hours(1),
                authorization_revision: format!("membership:{practice_id}"),
            })
        }
    }

    struct FixedGrantSessions(Result<SessionSummary, SessionError>);

    #[async_trait]
    impl SessionPort for FixedGrantSessions {
        async fn resolve(
            &self,
            _: &SessionCredential,
            _: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            self.0.clone()
        }
    }

    struct LogoutSessions(Result<LogoutResult, SessionError>);

    #[async_trait]
    impl SessionPort for LogoutSessions {
        async fn resolve(
            &self,
            _: &SessionCredential,
            _: Option<Uuid>,
        ) -> Result<SessionSummary, SessionError> {
            Err(SessionError::Unavailable)
        }

        async fn logout(&self, _: &SessionCredential) -> Result<LogoutResult, SessionError> {
            self.0.clone()
        }
    }

    struct Unused;

    #[async_trait]
    impl CaseRepository for Unused {
        async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
            Err(DomainError::NotFound)
        }
        async fn record_affirmation(
            &self,
            _: CaseId,
            _: GateAffirmationKind,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<GateState, DomainError> {
            Err(DomainError::NotFound)
        }
    }

    #[async_trait]
    impl EvidenceRepository for Unused {
        async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
            Err(DomainError::NotFound)
        }
    }

    #[async_trait]
    impl CriteriaRepository for Unused {
        async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
            Err(DomainError::NotFound)
        }
        async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
            Err(DomainError::NotFound)
        }
    }

    #[async_trait]
    impl LetterRepository for Unused {
        async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
            Err(DomainError::NotFound)
        }
        async fn unresolved_non_policy_retrievals(
            &self,
            _: LetterId,
        ) -> Result<Vec<CriterionId>, DomainError> {
            Err(DomainError::NotFound)
        }
        async fn sign(
            &self,
            _: LetterId,
            _: ActorId,
            _: DateTime<Utc>,
        ) -> Result<Letter, DomainError> {
            Err(DomainError::NotFound)
        }
    }

    #[async_trait]
    impl AuthorityPort for Unused {
        async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
            Ok(false)
        }
    }

    impl Clock for Unused {
        fn now(&self) -> DateTime<Utc> {
            now()
        }
    }

    fn grant_app(sessions: Arc<dyn SessionPort>) -> Router {
        let services = Arc::new(AppServices {
            cases: Arc::new(Unused),
            evidence: Arc::new(Unused),
            criteria: Arc::new(Unused),
            letters: Arc::new(Unused),
            authority: Arc::new(Unused),
            clock: Arc::new(Unused),
            sessions,
        });
        crate::api_router(ServerState { services })
    }

    async fn grant_request(app: Router, uri: &str) -> Response {
        app.oneshot(
            Request::builder()
                .uri(uri)
                .header(header::COOKIE, "ory_kratos_session=synthetic")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn mounted_logout_returns_only_the_authoritative_result() {
        for (result, expected) in [
            (Ok(LogoutResult::Confirmed), StatusCode::NO_CONTENT),
            (
                Ok(LogoutResult::DeniedPending),
                StatusCode::SERVICE_UNAVAILABLE,
            ),
            (
                Err(SessionError::Unavailable),
                StatusCode::SERVICE_UNAVAILABLE,
            ),
        ] {
            let response = grant_app(Arc::new(LogoutSessions(result)))
                .oneshot(
                    Request::builder()
                        .method("DELETE")
                        .uri("/api/session")
                        .header(header::COOKIE, "ory_kratos_session=synthetic")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();

            assert_eq!(response.status(), expected);
            assert_eq!(
                response.headers().get(header::CACHE_CONTROL).unwrap(),
                "no-store"
            );
        }
    }

    #[tokio::test]
    async fn mounted_registry_derives_two_practice_grants() {
        let sessions = Arc::new(GrantSessions {
            calls: AtomicUsize::new(0),
        });
        for practice_id in [Uuid::from_u128(10), Uuid::from_u128(20)] {
            let response = grant_request(
                grant_app(sessions.clone()),
                &format!("/api/session/replica-grant?practiceId={practice_id}"),
            )
            .await;
            assert_eq!(response.status(), StatusCode::OK);
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            let grant: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(grant["practiceId"], practice_id.to_string());
            assert_eq!(grant["identityId"], Uuid::from_u128(1).to_string());
            assert_eq!(
                grant["originatingSessionId"],
                Uuid::from_u128(3).to_string()
            );
            assert_eq!(grant["expiresAt"], "2026-09-08T13:00:00Z");
            assert_eq!(
                grant["projectionRevision"],
                aso_host::projection::PROJECTION_REVISION
            );
            let projections = grant["projections"].as_array().unwrap();
            assert_eq!(projections.len(), 7);
            let states = projections
                .iter()
                .find(|projection| projection["id"] == "evidence_states")
                .unwrap();
            assert_eq!(states["primaryKey"], "key");
            let cases = projections
                .iter()
                .find(|projection| projection["id"] == "cases")
                .unwrap();
            assert_eq!(
                cases["scope"],
                json!({
                    "kind": "practice",
                    "column": "practice_id",
                    "value": practice_id,
                })
            );
            assert_eq!(
                cases["columns"],
                json!([
                    "id",
                    "practice_id",
                    "case_number",
                    "patient_id",
                    "surgeon_id",
                    "coordinator_id",
                    "payer_id",
                    "status",
                    "date_of_service",
                    "gate_affirmed_at",
                    "updated_at",
                    "revision",
                ])
            );
            assert!(
                projections
                    .iter()
                    .any(|projection| projection["id"] == "annotation_types")
            );
            assert!(
                projections
                    .iter()
                    .any(|projection| projection["id"] == "annotations")
            );
        }
        assert_eq!(sessions.calls.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn mounted_session_and_replica_grant_refuse_a_durable_denial() {
        let memberships = Arc::new(CountingMemberships {
            calls: AtomicUsize::new(0),
        });
        for path in ["/api/session", "/api/session/replica-grant"] {
            let service = SessionService {
                identities: Arc::new(ActiveIdentity),
                memberships: memberships.clone(),
                denials: Arc::new(DeniedSession),
                inactive_observer: Arc::new(DeniedSession),
                clock: Arc::new(Unused),
                continuity: Arc::new(SessionContinuity::default()),
            };
            let response = grant_request(
                grant_app(Arc::new(service)),
                &format!("{path}?practiceId={}", Uuid::from_u128(10)),
            )
            .await;

            assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
                json!({"error": "unauthenticated"})
            );
        }
        assert_eq!(memberships.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn mounted_cached_identity_observes_direct_revocation_before_refusal() {
        let memberships = Arc::new(AllowedMemberships {
            calls: AtomicUsize::new(0),
        });
        let denial = Arc::new(ObservedDenial {
            denied: AtomicBool::new(false),
            observations: AtomicUsize::new(0),
        });
        let service = SessionService {
            identities: Arc::new(RevokedAfterFirstValidation),
            memberships: memberships.clone(),
            denials: denial.clone(),
            inactive_observer: denial.clone(),
            clock: Arc::new(Unused),
            continuity: Arc::new(SessionContinuity::default()),
        };
        let app = grant_app(Arc::new(service));
        let uri = format!("/api/session?practiceId={}", Uuid::from_u128(10));

        let first = grant_request(app.clone(), &uri).await;
        assert_eq!(first.status(), StatusCode::OK);
        let revoked = grant_request(app, &uri).await;
        assert_eq!(revoked.status(), StatusCode::UNAUTHORIZED);
        assert!(denial.denied.load(Ordering::SeqCst));
        assert_eq!(denial.observations.load(Ordering::SeqCst), 1);
        assert_eq!(memberships.calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn mounted_registry_rejects_client_projection_controls() {
        let sessions = Arc::new(GrantSessions {
            calls: AtomicUsize::new(0),
        });
        for query in [
            "table=aso.cases",
            "where=practice_id%3Danything",
            "columns=id%2Cpatient_id",
        ] {
            let response = grant_request(
                grant_app(sessions.clone()),
                &format!(
                    "/api/session/replica-grant?practiceId={}&{query}",
                    Uuid::from_u128(10)
                ),
            )
            .await;
            assert_eq!(response.status(), StatusCode::BAD_REQUEST);
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
                json!({"error": "invalid_projection_request"})
            );
        }
        assert_eq!(sessions.calls.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn mounted_registry_refuses_failed_or_expired_membership_resolution() {
        let expired = SessionSummary {
            identity_id: Uuid::from_u128(1),
            session_id: Uuid::from_u128(3),
            user_id: Uuid::from_u128(2),
            practice_id: Uuid::from_u128(10),
            display_name: "Synthetic Registry User".into(),
            principal: Principal::User,
            capabilities: vec![],
            expires_at: now(),
            authorization_revision: "membership:expired".into(),
        };
        let nonhuman = |principal| SessionSummary {
            identity_id: Uuid::from_u128(1),
            session_id: Uuid::from_u128(3),
            user_id: Uuid::from_u128(2),
            practice_id: Uuid::from_u128(10),
            display_name: "Synthetic Registry Principal".into(),
            principal,
            capabilities: vec![],
            expires_at: "2026-09-08T13:00:00Z".parse().unwrap(),
            authorization_revision: "membership:nonhuman".into(),
        };
        let cases = [
            (
                Err(SessionError::PracticeDenied),
                StatusCode::FORBIDDEN,
                "practice_denied",
            ),
            (
                Err(SessionError::Unavailable),
                StatusCode::SERVICE_UNAVAILABLE,
                "session_unavailable",
            ),
            (Ok(expired), StatusCode::UNAUTHORIZED, "unauthenticated"),
            (
                Ok(nonhuman(Principal::Agent)),
                StatusCode::FORBIDDEN,
                "practice_denied",
            ),
            (
                Ok(nonhuman(Principal::Service)),
                StatusCode::FORBIDDEN,
                "practice_denied",
            ),
        ];

        for (result, expected_status, expected_error) in cases {
            let response = grant_request(
                grant_app(Arc::new(FixedGrantSessions(result))),
                &format!(
                    "/api/session/replica-grant?practiceId={}",
                    Uuid::from_u128(10)
                ),
            )
            .await;
            assert_eq!(response.status(), expected_status);
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
                json!({"error": expected_error})
            );
        }
    }

    #[tokio::test]
    async fn mounted_current_session_refuses_expired_or_nonhuman_port_results() {
        let summary = |principal, expires_at| SessionSummary {
            identity_id: Uuid::from_u128(1),
            session_id: Uuid::from_u128(3),
            user_id: Uuid::from_u128(2),
            practice_id: Uuid::from_u128(10),
            display_name: "Synthetic Session Principal".into(),
            principal,
            capabilities: vec![],
            expires_at,
            authorization_revision: "membership:session-boundary".into(),
        };
        let cases = [
            (
                summary(Principal::User, now()),
                StatusCode::UNAUTHORIZED,
                "unauthenticated",
            ),
            (
                summary(Principal::Agent, now() + Duration::hours(1)),
                StatusCode::FORBIDDEN,
                "practice_denied",
            ),
            (
                summary(Principal::Service, now() + Duration::hours(1)),
                StatusCode::FORBIDDEN,
                "practice_denied",
            ),
        ];

        for (summary, expected_status, expected_error) in cases {
            let response = grant_request(
                grant_app(Arc::new(FixedGrantSessions(Ok(summary)))),
                &format!("/api/session?practiceId={}", Uuid::from_u128(10)),
            )
            .await;
            assert_eq!(response.status(), expected_status);
            let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
            assert_eq!(
                serde_json::from_slice::<serde_json::Value>(&body).unwrap(),
                json!({"error": expected_error})
            );
        }
    }
}
