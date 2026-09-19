//! Trusted Ory Kratos session-ID revocation for durable logout recovery.

use aso_host::{
    logout::{LogoutClaim, SessionRevoker},
    session::SessionError,
};
use async_trait::async_trait;
use reqwest::{Client, StatusCode, Url, redirect};
use std::time::Duration;

pub struct KratosSessionRevoker {
    client: Client,
    sessions: Url,
    issuer: String,
}

impl KratosSessionRevoker {
    pub fn new(base: &str, issuer: &str, allow_insecure: bool) -> Result<Self, SessionError> {
        let mut sessions = super::validated_base_url(base, allow_insecure)?;
        let issuer = super::validated_base_url(issuer, allow_insecure)?.to_string();
        let prefix = sessions.path().trim_end_matches('/').to_owned();
        sessions.set_path(&format!("{prefix}/admin/sessions/"));
        let client = Client::builder()
            .redirect(redirect::Policy::none())
            .timeout(Duration::from_secs(3))
            .no_proxy()
            .build()
            .map_err(|_| SessionError::Unavailable)?;
        Ok(Self {
            client,
            sessions,
            issuer,
        })
    }
}

#[async_trait]
impl SessionRevoker for KratosSessionRevoker {
    async fn revoke(&self, claim: &LogoutClaim) -> Result<(), SessionError> {
        if claim.kratos_issuer != self.issuer {
            return Err(SessionError::Unavailable);
        }
        let endpoint = self
            .sessions
            .join(&claim.kratos_session_id.to_string())
            .map_err(|_| SessionError::Unavailable)?;
        let response = self
            .client
            .delete(endpoint)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|_| SessionError::Unavailable)?;
        match response.status() {
            // DELETE confirms inactivity. A missing session is already
            // inactive, which makes crash recovery idempotent.
            StatusCode::NO_CONTENT | StatusCode::NOT_FOUND => Ok(()),
            _ => Err(SessionError::Unavailable),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, extract::Path, http::StatusCode, routing::delete};
    use chrono::{Duration as ChronoDuration, Utc};
    use std::sync::{Arc, Mutex};
    use uuid::Uuid;

    async fn server(
        status: StatusCode,
    ) -> (String, Arc<Mutex<Vec<Uuid>>>, tokio::task::JoinHandle<()>) {
        let observed = Arc::new(Mutex::new(Vec::new()));
        let captured = observed.clone();
        let app = Router::new().route(
            "/admin/sessions/{session_id}",
            delete(move |Path(session_id): Path<Uuid>| {
                let captured = captured.clone();
                async move {
                    captured.lock().unwrap().push(session_id);
                    status
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .expect("test listener");
        let base = format!("http://{}", listener.local_addr().expect("test address"));
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.expect("test server");
        });
        (base, observed, task)
    }

    fn claim() -> LogoutClaim {
        LogoutClaim {
            deployment_id: Uuid::from_u128(1),
            kratos_issuer: "https://identity.example.test/".into(),
            kratos_session_id: Uuid::from_u128(2),
            lease_token: Uuid::from_u128(3),
            lease_expires_at: Utc::now() + ChronoDuration::seconds(5),
        }
    }

    #[tokio::test]
    async fn revoker_uses_the_verified_session_id_and_accepts_inactive_states() {
        for status in [StatusCode::NO_CONTENT, StatusCode::NOT_FOUND] {
            let (base, observed, task) = server(status).await;
            let revoker = KratosSessionRevoker::new(&base, "https://identity.example.test/", true)
                .expect("revoker");
            revoker.revoke(&claim()).await.expect("inactive session");
            task.abort();
            assert_eq!(*observed.lock().unwrap(), [claim().kratos_session_id]);
        }
    }

    #[tokio::test]
    async fn revoker_leaves_non_inactive_responses_for_retry() {
        let (base, _, task) = server(StatusCode::SERVICE_UNAVAILABLE).await;
        let revoker = KratosSessionRevoker::new(&base, "https://identity.example.test/", true)
            .expect("revoker");
        assert_eq!(
            revoker.revoke(&claim()).await,
            Err(SessionError::Unavailable)
        );
        task.abort();
    }

    #[tokio::test]
    async fn revoker_refuses_a_claim_from_another_issuer() {
        let (base, observed, task) = server(StatusCode::NO_CONTENT).await;
        let revoker = KratosSessionRevoker::new(&base, "https://identity.example.test/", true)
            .expect("revoker");
        let mut foreign = claim();
        foreign.kratos_issuer = "https://other-identity.example.test/".into();
        assert_eq!(
            revoker.revoke(&foreign).await,
            Err(SessionError::Unavailable)
        );
        assert!(observed.lock().unwrap().is_empty());
        task.abort();
    }
}
