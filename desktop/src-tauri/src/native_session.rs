//! Host-owned native authentication transport and credential storage.
//!
//! The renderer may receive [`NativeSessionProjection`]. It never receives the
//! opaque Kratos session token or direct access to the platform credential
//! store. Full Tauri IPC registration belongs to the adjacent command task.

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use reqwest::{
    Client, Response, Url,
    header::{HeaderValue, LOCATION},
    redirect,
};
use secrecy::{ExposeSecret, SecretString};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use uuid::Uuid;

use crate::NativeSessionCredentialOwner;

const MAX_IDENTITY_RESPONSE_BYTES: usize = 64 * 1024;
const PLATFORM_CREDENTIAL_SERVICE: &str = "com.tribehealth.prior-auth.kratos-session";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum NativeAuthenticationError {
    #[error("native credential facility unavailable")]
    CredentialFacilityUnavailable,
    #[error("native identity provider unavailable")]
    ProviderUnavailable,
    #[error("native identity is unauthenticated")]
    Unauthenticated,
    #[error("native login credentials were refused")]
    InvalidCredentials,
    #[error("native login flow expired")]
    FlowExpired,
}

pub trait ProtectedCredentialStore: Send + Sync {
    fn replace(&self, token: &SecretString) -> Result<(), NativeAuthenticationError>;
    fn load(&self) -> Result<Option<SecretString>, NativeAuthenticationError>;
    fn remove(&self) -> Result<(), NativeAuthenticationError>;
}

/// Desktop credential storage backed by macOS Keychain, Windows Credential
/// Manager or the freedesktop Secret Service through the pinned `keyring`
/// crate. No plaintext fallback is provided when that facility is unavailable.
pub struct PlatformCredentialStore {
    account: String,
}

impl PlatformCredentialStore {
    pub fn new(deployment_id: impl Into<String>) -> Self {
        Self {
            account: deployment_id.into(),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, NativeAuthenticationError> {
        keyring::Entry::new(PLATFORM_CREDENTIAL_SERVICE, &self.account)
            .map_err(|_| NativeAuthenticationError::CredentialFacilityUnavailable)
    }
}

impl ProtectedCredentialStore for PlatformCredentialStore {
    fn replace(&self, token: &SecretString) -> Result<(), NativeAuthenticationError> {
        self.entry()?
            .set_password(token.expose_secret())
            .map_err(|_| NativeAuthenticationError::CredentialFacilityUnavailable)
    }

    fn load(&self) -> Result<Option<SecretString>, NativeAuthenticationError> {
        match self.entry()?.get_password() {
            Ok(token) => Ok(Some(SecretString::from(token))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(NativeAuthenticationError::CredentialFacilityUnavailable),
        }
    }

    fn remove(&self) -> Result<(), NativeAuthenticationError> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(NativeAuthenticationError::CredentialFacilityUnavailable),
        }
    }
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NativeSessionProjection {
    pub session_id: Uuid,
    pub identity_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub authenticator_assurance_level: String,
}

#[derive(Deserialize)]
struct LoginFlow {
    id: Uuid,
    ui: LoginUi,
}

#[derive(Deserialize)]
struct LoginUi {
    action: String,
}

#[derive(Serialize)]
struct PasswordLoginRequest<'a> {
    method: &'static str,
    identifier: &'a str,
    password: &'a str,
}

#[derive(Deserialize)]
struct LoginResult {
    session_token: String,
}

#[derive(Deserialize)]
struct KratosSession {
    id: Uuid,
    active: bool,
    expires_at: DateTime<Utc>,
    authenticator_assurance_level: String,
    identity: KratosIdentity,
}

#[derive(Deserialize)]
struct KratosIdentity {
    id: Uuid,
}

pub struct NativeKratosTransport {
    client: Client,
    base: Url,
    store: Arc<dyn ProtectedCredentialStore>,
}

impl NativeKratosTransport {
    pub fn new(
        base: &str,
        allow_insecure: bool,
        store: Arc<dyn ProtectedCredentialStore>,
    ) -> Result<Self, NativeAuthenticationError> {
        let mut base =
            Url::parse(base).map_err(|_| NativeAuthenticationError::ProviderUnavailable)?;
        if !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
            || !(base.scheme() == "https" || (allow_insecure && base.scheme() == "http"))
        {
            return Err(NativeAuthenticationError::ProviderUnavailable);
        }
        if !base.path().ends_with('/') {
            base.set_path(&format!("{}/", base.path()));
        }
        let client = Client::builder()
            .redirect(redirect::Policy::none())
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| NativeAuthenticationError::ProviderUnavailable)?;
        Ok(Self {
            client,
            base,
            store,
        })
    }

    /// Qualifies the Kratos native password transport. Production OIDC uses
    /// the separately selected system-browser/deep-link exchange path.
    pub async fn login_with_password(
        &self,
        identifier: &str,
        password: SecretString,
    ) -> Result<NativeSessionProjection, NativeAuthenticationError> {
        let flow_url = self.endpoint("self-service/login/api")?;
        let flow_response = self
            .client
            .get(flow_url)
            .header("accept", "application/json")
            .send()
            .await
            .map_err(|_| NativeAuthenticationError::ProviderUnavailable)?;
        if !flow_response.status().is_success() {
            return Err(NativeAuthenticationError::ProviderUnavailable);
        }
        let flow: LoginFlow = bounded_json(flow_response).await?;
        let action = self.validated_login_action(&flow)?;
        let login_response = self
            .client
            .post(action)
            .header("accept", "application/json")
            .json(&PasswordLoginRequest {
                method: "password",
                identifier,
                password: password.expose_secret(),
            })
            .send()
            .await
            .map_err(|_| NativeAuthenticationError::ProviderUnavailable)?;
        match login_response.status().as_u16() {
            200 => {}
            400 | 401 => return Err(NativeAuthenticationError::InvalidCredentials),
            410 => return Err(NativeAuthenticationError::FlowExpired),
            _ => return Err(NativeAuthenticationError::ProviderUnavailable),
        }
        let login: LoginResult = bounded_json(login_response).await?;
        let token = SecretString::from(login.session_token);
        let projection = self.verify_token(&token).await?;
        let store = self.store.clone();
        let token_for_store = token.clone();
        tokio::task::spawn_blocking(move || store.replace(&token_for_store))
            .await
            .map_err(|_| NativeAuthenticationError::CredentialFacilityUnavailable)??;
        Ok(projection)
    }

    pub async fn current_session(
        &self,
    ) -> Result<NativeSessionProjection, NativeAuthenticationError> {
        let store = self.store.clone();
        let token = tokio::task::spawn_blocking(move || store.load())
            .await
            .map_err(|_| NativeAuthenticationError::CredentialFacilityUnavailable)??
            .ok_or(NativeAuthenticationError::Unauthenticated)?;
        match self.verify_token(&token).await {
            Ok(session) => Ok(session),
            Err(NativeAuthenticationError::Unauthenticated) => {
                let store = self.store.clone();
                tokio::task::spawn_blocking(move || store.remove())
                    .await
                    .map_err(|_| NativeAuthenticationError::CredentialFacilityUnavailable)??;
                Err(NativeAuthenticationError::Unauthenticated)
            }
            Err(error) => Err(error),
        }
    }

    pub async fn clear(&self) -> Result<(), NativeAuthenticationError> {
        let store = self.store.clone();
        tokio::task::spawn_blocking(move || store.remove())
            .await
            .map_err(|_| NativeAuthenticationError::CredentialFacilityUnavailable)??;
        Ok(())
    }

    fn endpoint(&self, path: &str) -> Result<Url, NativeAuthenticationError> {
        self.base
            .join(path)
            .map_err(|_| NativeAuthenticationError::ProviderUnavailable)
    }

    fn validated_login_action(&self, flow: &LoginFlow) -> Result<Url, NativeAuthenticationError> {
        let advertised = Url::parse(&flow.ui.action)
            .map_err(|_| NativeAuthenticationError::ProviderUnavailable)?;
        let expected_path = self.endpoint("self-service/login")?.path().to_owned();
        let matching_flow = advertised
            .query_pairs()
            .any(|(name, value)| name == "flow" && value == flow.id.to_string());
        if advertised.path() != expected_path || !matching_flow {
            return Err(NativeAuthenticationError::ProviderUnavailable);
        }
        let mut trusted_action = self.endpoint("self-service/login")?;
        trusted_action.set_query(advertised.query());
        Ok(trusted_action)
    }

    async fn verify_token(
        &self,
        token: &SecretString,
    ) -> Result<NativeSessionProjection, NativeAuthenticationError> {
        let mut header = HeaderValue::from_str(token.expose_secret())
            .map_err(|_| NativeAuthenticationError::Unauthenticated)?;
        header.set_sensitive(true);
        let response = self
            .client
            .get(self.endpoint("sessions/whoami")?)
            .header("accept", "application/json")
            .header("x-session-token", header)
            .send()
            .await
            .map_err(|_| NativeAuthenticationError::ProviderUnavailable)?;
        match response.status().as_u16() {
            200 => {}
            401 | 403 => return Err(NativeAuthenticationError::Unauthenticated),
            _ => return Err(NativeAuthenticationError::ProviderUnavailable),
        }
        let session: KratosSession = bounded_json(response).await?;
        if !session.active || session.expires_at <= Utc::now() {
            return Err(NativeAuthenticationError::Unauthenticated);
        }
        Ok(NativeSessionProjection {
            session_id: session.id,
            identity_id: session.identity.id,
            expires_at: session.expires_at,
            authenticator_assurance_level: session.authenticator_assurance_level,
        })
    }
}

async fn bounded_json<T: DeserializeOwned>(
    mut response: Response,
) -> Result<T, NativeAuthenticationError> {
    if response
        .headers()
        .get(LOCATION)
        .and_then(|value| value.to_str().ok())
        .is_some()
    {
        return Err(NativeAuthenticationError::ProviderUnavailable);
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| NativeAuthenticationError::ProviderUnavailable)?
    {
        if chunk.len() > MAX_IDENTITY_RESPONSE_BYTES.saturating_sub(bytes.len()) {
            return Err(NativeAuthenticationError::ProviderUnavailable);
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes).map_err(|_| NativeAuthenticationError::ProviderUnavailable)
}

pub struct StoredNativeSessionCredentialOwner {
    store: Arc<dyn ProtectedCredentialStore>,
}

impl StoredNativeSessionCredentialOwner {
    pub fn new(store: Arc<dyn ProtectedCredentialStore>) -> Self {
        Self { store }
    }
}

#[async_trait]
impl NativeSessionCredentialOwner for StoredNativeSessionCredentialOwner {
    async fn credential(
        &self,
    ) -> Result<aso_host::session::SessionCredential, aso_host::session::SessionError> {
        let store = self.store.clone();
        match tokio::task::spawn_blocking(move || store.load()).await {
            Ok(Ok(Some(token))) => Ok(aso_host::session::SessionCredential::NativeToken(
                token.expose_secret().to_owned(),
            )),
            Ok(Ok(None)) => Err(aso_host::session::SessionError::Unauthenticated),
            Ok(Err(_)) | Err(_) => {
                Err(aso_host::session::SessionError::NativeAuthenticationUnavailable)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use axum::{
        Json, Router,
        extract::State,
        http::{HeaderMap, StatusCode},
        routing::{get, post},
    };
    use serde_json::{Value, json};

    use super::*;

    #[derive(Default)]
    struct MemoryCredentialStore(Mutex<Option<SecretString>>);

    impl ProtectedCredentialStore for MemoryCredentialStore {
        fn replace(&self, token: &SecretString) -> Result<(), NativeAuthenticationError> {
            *self.0.lock().unwrap() = Some(token.clone());
            Ok(())
        }

        fn load(&self) -> Result<Option<SecretString>, NativeAuthenticationError> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn remove(&self) -> Result<(), NativeAuthenticationError> {
            self.0.lock().unwrap().take();
            Ok(())
        }
    }

    #[derive(Clone)]
    struct ProviderState {
        action: String,
        identity_id: Uuid,
        session_id: Uuid,
        expires_at: DateTime<Utc>,
    }

    async fn create_flow(State(state): State<ProviderState>) -> Json<Value> {
        Json(json!({
            "id": "00000000-0000-0000-0000-000000000501",
            "ui": {"action": state.action}
        }))
    }

    async fn login(Json(body): Json<Value>) -> (StatusCode, Json<Value>) {
        if body
            == json!({
                "method": "password",
                "identifier": "clinician@example.invalid",
                "password": "synthetic-password"
            })
        {
            (
                StatusCode::OK,
                Json(json!({"session_token": "synthetic-opaque-token"})),
            )
        } else {
            (StatusCode::BAD_REQUEST, Json(json!({"error": "invalid"})))
        }
    }

    async fn whoami(
        State(state): State<ProviderState>,
        headers: HeaderMap,
    ) -> (StatusCode, Json<Value>) {
        if headers
            .get("x-session-token")
            .and_then(|value| value.to_str().ok())
            != Some("synthetic-opaque-token")
        {
            return (StatusCode::UNAUTHORIZED, Json(json!({})));
        }
        (
            StatusCode::OK,
            Json(json!({
                "id": state.session_id,
                "active": true,
                "expires_at": state.expires_at.to_rfc3339(),
                "authenticator_assurance_level": "aal1",
                "identity": {"id": state.identity_id}
            })),
        )
    }

    async fn provider(action_override: Option<String>) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let state = ProviderState {
            action: action_override.unwrap_or_else(|| {
                format!("{base}/self-service/login?flow=00000000-0000-0000-0000-000000000501")
            }),
            identity_id: Uuid::from_u128(601),
            session_id: Uuid::from_u128(602),
            expires_at: Utc::now() + chrono::Duration::minutes(5),
        };
        let app = Router::new()
            .route("/self-service/login/api", get(create_flow))
            .route("/self-service/login", post(login))
            .route("/sessions/whoami", get(whoami))
            .with_state(state);
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        (base, task)
    }

    #[tokio::test]
    async fn native_login_stores_token_in_host_and_returns_sanitized_projection() {
        let (base, server) = provider(None).await;
        let store: Arc<dyn ProtectedCredentialStore> = Arc::new(MemoryCredentialStore::default());
        let transport = NativeKratosTransport::new(&base, true, store.clone()).unwrap();
        let projection = transport
            .login_with_password(
                "clinician@example.invalid",
                SecretString::from("synthetic-password"),
            )
            .await
            .unwrap();

        assert_eq!(projection.identity_id, Uuid::from_u128(601));
        assert_eq!(transport.current_session().await.unwrap(), projection);
        let serialized = serde_json::to_string(&projection).unwrap();
        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("synthetic-opaque-token"));
        assert_eq!(
            format!("{:?}", store.load().unwrap().unwrap()),
            "SecretBox<str>([REDACTED])"
        );

        let owner = StoredNativeSessionCredentialOwner::new(store);
        assert!(matches!(
            owner.credential().await.unwrap(),
            aso_host::session::SessionCredential::NativeToken(token)
                if token == "synthetic-opaque-token"
        ));
        server.abort();
    }

    #[tokio::test]
    async fn provider_action_cannot_redirect_password_to_another_origin() {
        let (base, server) = provider(Some(
            "https://attacker.invalid/self-service/login?flow=00000000-0000-0000-0000-000000000501"
                .into(),
        ))
        .await;
        let transport =
            NativeKratosTransport::new(&base, true, Arc::new(MemoryCredentialStore::default()))
                .unwrap();

        // The advertised host is ignored. The trusted configured origin and
        // exact path/flow pair determine the submission target.
        let projection = transport
            .login_with_password(
                "clinician@example.invalid",
                SecretString::from("synthetic-password"),
            )
            .await
            .unwrap();
        assert_eq!(projection.identity_id, Uuid::from_u128(601));
        server.abort();
    }

    #[tokio::test]
    async fn provider_action_with_unexpected_path_is_refused() {
        let (base, server) = provider(Some(
            "http://127.0.0.1/self-service/exfiltrate?flow=00000000-0000-0000-0000-000000000501"
                .into(),
        ))
        .await;
        let transport =
            NativeKratosTransport::new(&base, true, Arc::new(MemoryCredentialStore::default()))
                .unwrap();

        assert_eq!(
            transport
                .login_with_password(
                    "clinician@example.invalid",
                    SecretString::from("synthetic-password"),
                )
                .await,
            Err(NativeAuthenticationError::ProviderUnavailable)
        );
        server.abort();
    }

    #[tokio::test]
    #[ignore = "requires live Kratos and an operating-system credential store"]
    async fn native_kratos_keyring_transport_end_to_end() {
        struct CredentialCleanup(Arc<dyn ProtectedCredentialStore>);

        impl Drop for CredentialCleanup {
            fn drop(&mut self) {
                let _ = self.0.remove();
            }
        }

        let base = std::env::var("ASO_TEST_KRATOS_PUBLIC_URL").unwrap();
        let email = std::env::var("ASO_TEST_NATIVE_EMAIL").unwrap();
        let password = SecretString::from(std::env::var("ASO_TEST_NATIVE_PASSWORD").unwrap());
        let account = std::env::var("ASO_TEST_NATIVE_ACCOUNT").unwrap();
        let store: Arc<dyn ProtectedCredentialStore> =
            Arc::new(PlatformCredentialStore::new(account));
        let _cleanup = CredentialCleanup(store.clone());
        store.remove().unwrap();
        let transport = NativeKratosTransport::new(&base, true, store.clone()).unwrap();

        let projection = transport
            .login_with_password(&email, password)
            .await
            .unwrap();
        println!("ra17 check passed: native login returned sanitized session");
        assert_eq!(transport.current_session().await.unwrap(), projection);
        println!("ra17 check passed: platform credential reopened protected session");
        let serialized = serde_json::to_string(&projection).unwrap();
        assert!(!serialized.contains("token"));
        assert!(!serialized.contains("password"));
        println!("ra17 check passed: renderer projection contains no credential");

        let owner = StoredNativeSessionCredentialOwner::new(store.clone());
        assert!(matches!(
            owner.credential().await,
            Ok(aso_host::session::SessionCredential::NativeToken(_))
        ));
        println!("ra17 check passed: host credential owner invoked protected session command");

        transport.clear().await.unwrap();
        assert!(matches!(
            owner.credential().await,
            Err(aso_host::session::SessionError::Unauthenticated)
        ));
        println!("ra17 check passed: platform credential removed on cleanup");
    }
}
