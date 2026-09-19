//! Configured outbound MCP transport. No model registry or public route exposes
//! this adapter; trusted host code supplies scope and one of six read operations.
use aso_host::{
    affirmation::ClinicalContext,
    document_generation::{GenerationError, GenerationProgress},
};
use axum::http::{HeaderName, HeaderValue};
use rmcp::{
    RoleClient, ServiceExt,
    model::*,
    service::{PeerRequestOptions, RunningService},
    transport::streamable_http_client::{
        SseError, StreamableHttpClient, StreamableHttpClientTransport,
        StreamableHttpClientTransportConfig, StreamableHttpError, StreamableHttpPostResponse,
    },
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    pin::Pin,
    sync::Arc,
    time::Duration,
};
use tokio_stream::Stream;
use uuid::Uuid;
const LIMIT: usize = 256 * 1024;
const DEADLINE: Duration = Duration::from_secs(10);
const READ_TOOLS: [&str; 6] = [
    "case_context",
    "source_page",
    "selected_policy",
    "evidence",
    "annotations",
    "template_metadata",
];
type HttpError = StreamableHttpError<std::io::Error>;
type EventStream = Pin<Box<dyn Stream<Item = Result<sse_stream::Sse, SseError>> + Send>>;
fn refused() -> HttpError {
    StreamableHttpError::UnexpectedServerResponse("configured MCP request refused".into())
}
fn unavailable() -> GenerationError {
    GenerationError::Unavailable
}

/// HTTP body limits apply before JSON/SSE decoding, including error responses.
/// Protocol/session negotiation remains owned by the official rmcp transport.
#[derive(Clone)]
struct BoundedHttp {
    client: reqwest::Client,
    url: Arc<str>,
}
impl BoundedHttp {
    fn request(
        &self,
        method: reqwest::Method,
        uri: &str,
        session: Option<&str>,
        auth: Option<&str>,
        headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<reqwest::RequestBuilder, HttpError> {
        if uri != self.url.as_ref() {
            return Err(refused());
        }
        let mut request = self
            .client
            .request(method, uri)
            .header("accept", "application/json, text/event-stream");
        if let Some(session) = session {
            request = request.header("mcp-session-id", session);
        }
        if let Some(auth) = auth {
            let mut value =
                HeaderValue::from_str(&format!("Bearer {auth}")).map_err(|_| refused())?;
            value.set_sensitive(true);
            request = request.header("authorization", value);
        }
        for (name, value) in headers {
            if matches!(name.as_str(), "authorization" | "cookie" | "host") {
                return Err(refused());
            }
            request = request.header(name, value);
        }
        Ok(request)
    }
    async fn body(mut response: reqwest::Response) -> Result<Vec<u8>, HttpError> {
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| refused())? {
            if chunk.len() > LIMIT - bytes.len() {
                return Err(refused());
            }
            bytes.extend_from_slice(&chunk);
        }
        Ok(bytes)
    }
    fn stream(mut response: reqwest::Response) -> EventStream {
        let (sender, receiver) = tokio::sync::mpsc::channel(1);
        tokio::spawn(async move {
            let mut received = 0usize;
            loop {
                let chunk =
                    tokio::select! {_=sender.closed()=>return,chunk=response.chunk()=>chunk};
                match chunk {
                    Ok(Some(chunk)) if chunk.len() <= LIMIT - received => {
                        received += chunk.len();
                        if sender.send(Ok(chunk)).await.is_err() {
                            return;
                        }
                    }
                    Ok(None) => return,
                    _ => {
                        let _ = sender
                            .send(Err(std::io::Error::other(
                                "MCP response unavailable or too large",
                            )))
                            .await;
                        return;
                    }
                }
            }
        });
        Box::pin(sse_stream::SseStream::from_bytes_stream(
            tokio_stream::wrappers::ReceiverStream::new(receiver),
        ))
    }
}
impl StreamableHttpClient for BoundedHttp {
    type Error = std::io::Error;
    async fn post_message(
        &self,
        uri: Arc<str>,
        message: ClientJsonRpcMessage,
        session_id: Option<Arc<str>>,
        auth_header: Option<String>,
        custom_headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<StreamableHttpPostResponse, HttpError> {
        let response = self
            .request(
                reqwest::Method::POST,
                &uri,
                session_id.as_deref(),
                auth_header.as_deref(),
                custom_headers,
            )?
            .json(&message)
            .send()
            .await
            .map_err(|_| refused())?;
        if response.status() == reqwest::StatusCode::ACCEPTED {
            return Ok(StreamableHttpPostResponse::Accepted);
        }
        if !response.status().is_success() {
            return Err(refused());
        }
        let session = response
            .headers()
            .get("mcp-session-id")
            .map(|value| value.to_str().map(str::to_owned))
            .transpose()
            .map_err(|_| refused())?;
        let content = response
            .headers()
            .get("content-type")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_owned();
        if content.starts_with("text/event-stream") {
            return Ok(StreamableHttpPostResponse::Sse(
                Self::stream(response),
                session,
            ));
        }
        if content.starts_with("application/json") {
            let bytes = Self::body(response).await?;
            return Ok(StreamableHttpPostResponse::Json(
                serde_json::from_slice(&bytes).map_err(|_| refused())?,
                session,
            ));
        }
        Err(refused())
    }
    async fn delete_session(
        &self,
        uri: Arc<str>,
        session_id: Arc<str>,
        auth_header: Option<String>,
        custom_headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<(), HttpError> {
        let response = self
            .request(
                reqwest::Method::DELETE,
                &uri,
                Some(&session_id),
                auth_header.as_deref(),
                custom_headers,
            )?
            .send()
            .await
            .map_err(|_| refused())?;
        if response.status().is_success() {
            Ok(())
        } else if response.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED {
            Err(StreamableHttpError::ServerDoesNotSupportDeleteSession)
        } else {
            Err(refused())
        }
    }
    async fn get_stream(
        &self,
        uri: Arc<str>,
        session_id: Option<Arc<str>>,
        last_event_id: Option<String>,
        auth_header: Option<String>,
        custom_headers: HashMap<HeaderName, HeaderValue>,
    ) -> Result<EventStream, HttpError> {
        let mut request = self
            .request(
                reqwest::Method::GET,
                &uri,
                session_id.as_deref(),
                auth_header.as_deref(),
                custom_headers,
            )?
            .header("accept", "text/event-stream");
        if let Some(id) = last_event_id {
            request = request.header("last-event-id", id);
        }
        let response = request.send().await.map_err(|_| refused())?;
        if response.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED {
            return Err(StreamableHttpError::ServerDoesNotSupportSse);
        }
        if !response.status().is_success()
            || !response
                .headers()
                .get("content-type")
                .is_some_and(|value| value.as_bytes().starts_with(b"text/event-stream"))
        {
            return Err(refused());
        }
        Ok(Self::stream(response))
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ServerEntry {
    name: String,
    url: String,
    bearer_token_file: String,
    allowed_tools: BTreeSet<String>,
}
struct ConfiguredServer {
    client: RunningService<RoleClient, ClientConfig>,
    tools: BTreeSet<String>,
}
pub struct ConfiguredMcpClients {
    servers: BTreeMap<String, ConfiguredServer>,
}
/// Only host-owned typed requests can select an effect or form tool arguments.
#[allow(dead_code)]
pub enum AuthorizedMcpRead {
    CaseContext,
    SourcePage { source_id: String },
    SelectedPolicy,
    Evidence,
    Annotations,
    TemplateMetadata,
}
impl AuthorizedMcpRead {
    fn name(&self) -> &'static str {
        match self {
            Self::CaseContext => "case_context",
            Self::SourcePage { .. } => "source_page",
            Self::SelectedPolicy => "selected_policy",
            Self::Evidence => "evidence",
            Self::Annotations => "annotations",
            Self::TemplateMetadata => "template_metadata",
        }
    }
}
impl ConfiguredMcpClients {
    pub async fn load_optional(path: Option<String>) -> Result<Option<Arc<Self>>, GenerationError> {
        let Some(path) = path else { return Ok(None) };
        let bytes = std::fs::read(path).map_err(|_| unavailable())?;
        if bytes.len() > 64 * 1024 {
            return Err(unavailable());
        }
        let entries: Vec<ServerEntry> =
            serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
        if entries.is_empty() || entries.len() > 8 {
            return Err(unavailable());
        }
        let mut clients = Self {
            servers: BTreeMap::new(),
        };
        for entry in entries {
            if entry.name.is_empty()
                || entry.name.len() > 64
                || !entry
                    .name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
                || clients.servers.contains_key(&entry.name)
                || entry.allowed_tools.is_empty()
                || entry
                    .allowed_tools
                    .iter()
                    .any(|name| !READ_TOOLS.contains(&name.as_str()))
            {
                return Err(unavailable());
            }
            let url = reqwest::Url::parse(&entry.url).map_err(|_| unavailable())?;
            if !matches!(url.scheme(), "http" | "https")
                || url.host_str().is_none()
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
            {
                return Err(unavailable());
            }
            let token =
                std::fs::read_to_string(&entry.bearer_token_file).map_err(|_| unavailable())?;
            let token = token.trim_end_matches(['\r', '\n']);
            if token.is_empty() || token.len() > 8192 || token.chars().any(char::is_whitespace) {
                return Err(unavailable());
            }
            let http = reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(DEADLINE)
                .build()
                .map_err(|_| unavailable())?;
            let uri: Arc<str> = Arc::from(url.as_str());
            let mut config = StreamableHttpClientTransportConfig::with_uri(uri.clone())
                .auth_header(token)
                .max_concurrent_requests(1)
                .max_sse_event_size(LIMIT)
                .reinit_on_expired_session(false);
            config.channel_buffer_capacity = 4;
            let transport = StreamableHttpClientTransport::with_client(
                BoundedHttp {
                    client: http,
                    url: uri,
                },
                config,
            );
            let client_config = ClientConfig::new(
                ClientCapabilities::default(),
                Implementation::new("aso-generation-tools", env!("CARGO_PKG_VERSION")),
            )
            .with_protocol_version(ProtocolVersion::V_2025_11_25);
            let client = tokio::time::timeout(DEADLINE, client_config.serve(transport))
                .await
                .map_err(|_| unavailable())?
                .map_err(|_| unavailable())?;
            if !client
                .peer_info()
                .is_some_and(|info| info.protocol_version == ProtocolVersion::V_2025_11_25)
            {
                return Err(unavailable());
            }
            let mut cursor = None;
            let mut found = BTreeSet::new();
            let mut complete = false;
            for _ in 0..4 {
                let params = cursor.map(|cursor| {
                    let mut params = PaginatedRequestParams::default();
                    params.cursor = Some(cursor);
                    params
                });
                let result = tokio::time::timeout(DEADLINE, client.list_tools(params))
                    .await
                    .map_err(|_| unavailable())?
                    .map_err(|_| unavailable())?;
                for tool in result.tools {
                    if entry.allowed_tools.contains(tool.name.as_ref()) {
                        let schema =
                            serde_json::to_value(&tool.input_schema).map_err(|_| unavailable())?;
                        let fields = if tool.name == "source_page" {
                            vec!["practiceId", "caseId", "sourceId"]
                        } else {
                            vec!["practiceId", "caseId"]
                        };
                        let required = schema["required"].as_array().ok_or_else(unavailable)?;
                        if schema["type"] != "object"
                            || required.len() != fields.len()
                            || fields.iter().any(|field| {
                                !required.contains(&json!(field))
                                    || schema["properties"][field]["type"] != "string"
                            })
                            || !found.insert(tool.name.to_string())
                        {
                            return Err(unavailable());
                        }
                    }
                }
                cursor = result.next_cursor;
                if cursor.is_none() {
                    complete = true;
                    break;
                }
            }
            if !complete || found != entry.allowed_tools {
                return Err(unavailable());
            }
            clients.servers.insert(
                entry.name,
                ConfiguredServer {
                    client,
                    tools: found,
                },
            );
        }
        Ok(Some(Arc::new(clients)))
    }
    /// Kept private to the host adapter layer until an authorized tool registry
    /// connects it to generation. No model-supplied practice/case fields exist.
    #[allow(dead_code)]
    pub async fn call_read(
        &self,
        server: &str,
        context: &ClinicalContext,
        case_id: Uuid,
        request: AuthorizedMcpRead,
        progress: &dyn GenerationProgress,
    ) -> Result<Value, GenerationError> {
        let server = self.servers.get(server).ok_or(GenerationError::Denied)?;
        let name = request.name();
        if !server.tools.contains(name) || context.expires_at <= chrono::Utc::now() {
            return Err(GenerationError::Denied);
        }
        progress.checkpoint("retrieval").await?;
        let mut arguments = json!({"practiceId":context.practice.0,"caseId":case_id});
        if let AuthorizedMcpRead::SourcePage { source_id } = request {
            if source_id.is_empty() || source_id.len() > 256 {
                return Err(GenerationError::Denied);
            }
            arguments["sourceId"] = json!(source_id);
        }
        let params = CallToolRequestParams::new(name)
            .with_arguments(arguments.as_object().expect("scoped arguments").clone());
        let mut handle = tokio::time::timeout(
            DEADLINE,
            server.client.send_cancellable_request(
                ClientRequest::CallToolRequest(CallToolRequest::new(params)),
                PeerRequestOptions::no_options(),
            ),
        )
        .await
        .map_err(|_| unavailable())?
        .map_err(|_| unavailable())?;
        let mut checkpoint = tokio::time::interval(Duration::from_millis(500));
        checkpoint.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        checkpoint.tick().await;
        let deadline = tokio::time::sleep(DEADLINE);
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                biased;
                _=&mut deadline=>{let _=tokio::time::timeout(Duration::from_secs(1),handle.cancel(Some("bounded tool deadline".into()))).await;return Err(unavailable());},
                _=checkpoint.tick()=>{let result=if context.expires_at<=chrono::Utc::now(){Err(GenerationError::Denied)}else{progress.checkpoint("retrieval").await};if let Err(error)=result{let _=tokio::time::timeout(Duration::from_secs(1),handle.cancel(Some("host authority or cancellation".into()))).await;return Err(error);}},
                response=&mut handle.rx=>{
                    let response=response.map_err(|_|unavailable())?.map_err(|_|unavailable())?;
                    let ServerResult::CallToolResult(result)=response else{return Err(unavailable())};
                    if result.is_error==Some(true){return Err(unavailable());}
                    let bytes=serde_json::to_vec(&result).map_err(|_|unavailable())?;
                    if bytes.len()>LIMIT{return Err(unavailable());}
                    return serde_json::from_slice(&bytes).map_err(|_|unavailable());
                }
            }
        }
    }
}
impl Drop for ConfiguredMcpClients {
    fn drop(&mut self) {
        for server in self.servers.values() {
            server.client.cancellation_token().cancel();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aso_host::{
        domain::{ActorId, PracticeId},
        session::Principal,
    };
    use axum::{Router, extract::State, http::HeaderMap, response::IntoResponse, routing::post};
    use rmcp::{
        ErrorData, RoleServer, ServerHandler,
        service::RequestContext,
        transport::streamable_http_server::{
            StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
        },
    };
    use std::sync::{
        Mutex,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    };
    #[derive(Clone)]
    struct FakeTools {
        calls: Arc<AtomicUsize>,
        arguments: Arc<Mutex<Option<Value>>>,
        canceled: Arc<AtomicBool>,
        mode: u8,
    }
    impl ServerHandler for FakeTools {
        fn get_info(&self) -> ServerConfig {
            ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
                .with_protocol_version(ProtocolVersion::V_2025_11_25)
        }
        fn supported_protocol_versions(&self) -> std::borrow::Cow<'static, [ProtocolVersion]> {
            std::borrow::Cow::Owned(vec![ProtocolVersion::V_2025_11_25])
        }
        async fn list_tools(
            &self,
            _: Option<PaginatedRequestParams>,
            context: RequestContext<RoleServer>,
        ) -> Result<ListToolsResult, ErrorData> {
            let parts = context
                .extensions
                .get::<axum::http::request::Parts>()
                .unwrap();
            assert_eq!(
                parts.headers.get("authorization").unwrap(),
                "Bearer synthetic-mcp-key"
            );
            Ok(serde_json::from_value(json!({"tools":[{"name":"case_context","inputSchema":{"type":"object","required":["practiceId","caseId"],"properties":{"practiceId":{"type":"string"},"caseId":{"type":"string"}},"additionalProperties":false}},{"name":"sign_letter","inputSchema":{"type":"object","properties":{}}}]})).unwrap())
        }
        async fn call_tool(
            &self,
            request: CallToolRequestParams,
            context: RequestContext<RoleServer>,
        ) -> Result<CallToolResponse, ErrorData> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            *self.arguments.lock().unwrap() = Some(json!(request.arguments));
            if self.mode == 2 {
                context.ct.cancelled().await;
                self.canceled.store(true, Ordering::SeqCst);
                return Ok(CallToolResult::error(vec![ContentBlock::text("canceled")]).into());
            }
            let text = if self.mode == 1 {
                "x".repeat(LIMIT + 1)
            } else {
                "synthetic scoped result".into()
            };
            Ok(CallToolResult::success(vec![ContentBlock::text(text)]).into())
        }
    }
    struct Files {
        root: std::path::PathBuf,
        path: String,
    }
    impl Files {
        fn new(url: &str, tools: Value) -> Self {
            let root = std::env::temp_dir().join(format!("aso-mcp-{}", Uuid::new_v4()));
            std::fs::create_dir(&root).unwrap();
            let token = root.join("token");
            std::fs::write(&token, "synthetic-mcp-key\n").unwrap();
            let config = root.join("servers.json");
            std::fs::write(&config,json!([{"name":"source-server","url":url,"bearerTokenFile":token,"allowedTools":tools}]).to_string()).unwrap();
            Self {
                path: config.to_str().unwrap().to_owned(),
                root,
            }
        }
    }
    impl Drop for Files {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
    async fn fixture(
        mode: u8,
        json_response: bool,
    ) -> (Files, FakeTools, tokio::task::JoinHandle<()>) {
        let fake = FakeTools {
            calls: Arc::new(AtomicUsize::new(0)),
            arguments: Arc::new(Mutex::new(None)),
            canceled: Arc::new(AtomicBool::new(false)),
            mode,
        };
        let service_fake = fake.clone();
        let service = StreamableHttpService::new(
            move || Ok(service_fake.clone()),
            LocalSessionManager::default().into(),
            StreamableHttpServerConfig::default()
                .with_legacy_session_mode(false)
                .with_json_response(json_response),
        );
        let router = Router::new().nest_service("/mcp", service);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, router).await.unwrap();
        });
        (
            Files::new(&format!("http://{address}/mcp"), json!(["case_context"])),
            fake,
            server,
        )
    }
    struct Progress {
        canceled: Arc<AtomicBool>,
    }
    #[async_trait::async_trait]
    impl GenerationProgress for Progress {
        async fn checkpoint(&self, _: &str) -> Result<(), GenerationError> {
            if self.canceled.load(Ordering::SeqCst) {
                Err(GenerationError::Canceled)
            } else {
                Ok(())
            }
        }
        async fn provisional_text(&self, _: &str) -> Result<(), GenerationError> {
            Ok(())
        }
    }
    fn context() -> ClinicalContext {
        ClinicalContext {
            identity_id: Uuid::nil(),
            actor: ActorId(Uuid::from_u128(1)),
            practice: PracticeId(Uuid::from_u128(2)),
            principal: Principal::Service,
            expires_at: chrono::Utc::now() + chrono::Duration::minutes(5),
        }
    }
    #[tokio::test]
    async fn configured_client_negotiates_and_injects_scope_but_refuses_unconfigured_effects() {
        let (files, fake, server) = fixture(0, false).await;
        let clients = ConfiguredMcpClients::load_optional(Some(files.path.clone()))
            .await
            .unwrap()
            .unwrap();
        let progress = Progress {
            canceled: Arc::new(AtomicBool::new(false)),
        };
        let context = context();
        let case = Uuid::from_u128(3);
        let result = clients
            .call_read(
                "source-server",
                &context,
                case,
                AuthorizedMcpRead::CaseContext,
                &progress,
            )
            .await
            .unwrap();
        assert_eq!(result["content"][0]["text"], "synthetic scoped result");
        assert_eq!(
            fake.arguments.lock().unwrap().as_ref().unwrap(),
            &json!({"practiceId":context.practice.0,"caseId":case})
        );
        assert!(matches!(
            clients
                .call_read(
                    "other-server",
                    &context,
                    case,
                    AuthorizedMcpRead::CaseContext,
                    &progress
                )
                .await,
            Err(GenerationError::Denied)
        ));
        assert!(matches!(
            clients
                .call_read(
                    "source-server",
                    &context,
                    case,
                    AuthorizedMcpRead::SourcePage {
                        source_id: "unapproved".into()
                    },
                    &progress
                )
                .await,
            Err(GenerationError::Denied)
        ));
        assert_eq!(fake.calls.load(Ordering::SeqCst), 1);
        drop(clients);
        server.abort();
    }
    #[tokio::test]
    async fn json_and_sse_responses_are_capped_before_artifact_decoding() {
        for json_response in [true, false] {
            let (files, _, server) = fixture(1, json_response).await;
            let clients = ConfiguredMcpClients::load_optional(Some(files.path.clone()))
                .await
                .unwrap()
                .unwrap();
            let progress = Progress {
                canceled: Arc::new(AtomicBool::new(false)),
            };
            assert!(
                clients
                    .call_read(
                        "source-server",
                        &context(),
                        Uuid::from_u128(3),
                        AuthorizedMcpRead::CaseContext,
                        &progress
                    )
                    .await
                    .is_err()
            );
            drop(clients);
            server.abort();
        }
    }
    #[tokio::test]
    async fn host_cancellation_reaches_the_remote_tool() {
        let (files, fake, server) = fixture(2, false).await;
        let clients = ConfiguredMcpClients::load_optional(Some(files.path.clone()))
            .await
            .unwrap()
            .unwrap();
        let canceled = Arc::new(AtomicBool::new(false));
        let trigger = canceled.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(100)).await;
            trigger.store(true, Ordering::SeqCst);
        });
        let result = clients
            .call_read(
                "source-server",
                &context(),
                Uuid::from_u128(3),
                AuthorizedMcpRead::CaseContext,
                &Progress { canceled },
            )
            .await;
        assert!(matches!(result, Err(GenerationError::Canceled)));
        tokio::time::timeout(Duration::from_secs(1), async {
            while !fake.canceled.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        drop(clients);
        server.abort();
    }
    #[tokio::test]
    async fn omitted_config_has_no_client_and_unsafe_config_is_refused() {
        assert!(
            ConfiguredMcpClients::load_optional(None)
                .await
                .unwrap()
                .is_none()
        );
        for url in [
            "http://user:secret@127.0.0.1/mcp",
            "http://127.0.0.1/mcp?route=other",
            "http://127.0.0.1/mcp#other",
            "file:///tmp/mcp",
        ] {
            let files = Files::new(url, json!(["case_context"]));
            assert!(
                ConfiguredMcpClients::load_optional(Some(files.path.clone()))
                    .await
                    .is_err()
            );
        }
        let files = Files::new("http://127.0.0.1:1/mcp", json!(["sign_letter"]));
        assert!(
            ConfiguredMcpClients::load_optional(Some(files.path.clone()))
                .await
                .is_err()
        );
    }
    async fn redirect(State(target): State<String>, _headers: HeaderMap) -> impl IntoResponse {
        (
            axum::http::StatusCode::TEMPORARY_REDIRECT,
            [("location", target)],
        )
    }
    #[tokio::test]
    async fn redirects_cannot_send_credentials_to_an_unconfigured_endpoint() {
        let calls = Arc::new(AtomicUsize::new(0));
        let observed = calls.clone();
        let target = Router::new().route(
            "/other",
            post(move || {
                observed.fetch_add(1, Ordering::SeqCst);
                async { "unexpected" }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let target_server = tokio::spawn(async move {
            axum::serve(listener, target).await.unwrap();
        });
        let source = Router::new()
            .route("/mcp", post(redirect))
            .with_state(format!("http://{address}/other"));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let source_server = tokio::spawn(async move {
            axum::serve(listener, source).await.unwrap();
        });
        let files = Files::new(&format!("http://{address}/mcp"), json!(["case_context"]));
        assert!(
            ConfiguredMcpClients::load_optional(Some(files.path.clone()))
                .await
                .is_err()
        );
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        source_server.abort();
        target_server.abort();
    }
}
