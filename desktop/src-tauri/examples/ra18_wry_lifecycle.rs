use std::{
    fs,
    path::{Component, Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicI32, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

use aso_desktop_lib::{
    DesktopState, NativeSessionCredentialOwner, configure_tauri, ipc::NativeIpcAuthority,
    native_commands::UnavailableNativeClinicalCommands,
};
use aso_host::{
    AppServices,
    domain::{
        ActorId, Capability, CaseId, CriterionId, DomainError, GateAffirmationKind, GateState,
        Letter, LetterId,
    },
    ports::{
        AuthorityPort, CaseRepository, Clock, CriteriaRepository, Criterion, EvidenceCounts,
        EvidenceRepository, LetterRepository, SystemClock,
    },
    session::{Principal, SessionCredential, SessionError, SessionPort, SessionSummary},
};
use async_trait::async_trait;
use chrono::Utc;
use serde_json::{Value, json};
use tauri::{AppHandle, Listener, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry};
use uuid::Uuid;

const PRACTICE_A: Uuid = Uuid::from_u128(0x101);
const PRACTICE_B: Uuid = Uuid::from_u128(0x201);
const RECEIPT_TIMEOUT: Duration = Duration::from_secs(20);
const PGLITE_RECEIPT_TIMEOUT: Duration = Duration::from_secs(600);

#[derive(Debug)]
struct Receipt {
    window: String,
    payload: Value,
}

struct FixtureSessions;

#[async_trait]
impl SessionPort for FixtureSessions {
    async fn resolve(
        &self,
        _: &SessionCredential,
        practice: Option<Uuid>,
    ) -> Result<SessionSummary, SessionError> {
        let practice = practice.ok_or(SessionError::PracticeDenied)?;
        let (identity_id, session_id, user_id, authorization_revision) = match practice {
            PRACTICE_A => (
                Uuid::from_u128(0x111),
                Uuid::from_u128(0x112),
                Uuid::from_u128(0x113),
                "fixture:a",
            ),
            PRACTICE_B => (
                Uuid::from_u128(0x211),
                Uuid::from_u128(0x212),
                Uuid::from_u128(0x213),
                "fixture:b",
            ),
            _ => return Err(SessionError::PracticeDenied),
        };
        Ok(SessionSummary {
            identity_id,
            session_id,
            user_id,
            practice_id: practice,
            display_name: "Synthetic native fixture".into(),
            principal: Principal::User,
            capabilities: Vec::new(),
            expires_at: Utc::now() + chrono::Duration::hours(1),
            authorization_revision: authorization_revision.into(),
        })
    }
}

struct FixtureCredential;

#[async_trait]
impl NativeSessionCredentialOwner for FixtureCredential {
    async fn credential(&self) -> Result<SessionCredential, SessionError> {
        Ok(SessionCredential::NativeToken(
            "synthetic-ra18-fixture-token".into(),
        ))
    }
}

struct UnexpectedDomainCalls;

#[async_trait]
impl CaseRepository for UnexpectedDomainCalls {
    async fn gate_state(&self, _: CaseId) -> Result<GateState, DomainError> {
        panic!("RA18 lifecycle fixture must not read a clinical case")
    }

    async fn record_affirmation(
        &self,
        _: CaseId,
        _: GateAffirmationKind,
        _: ActorId,
        _: chrono::DateTime<Utc>,
    ) -> Result<GateState, DomainError> {
        panic!("RA18 lifecycle fixture must not affirm a clinical gate")
    }
}

#[async_trait]
impl EvidenceRepository for UnexpectedDomainCalls {
    async fn counts(&self, _: CaseId) -> Result<EvidenceCounts, DomainError> {
        panic!("RA18 lifecycle fixture must not read clinical evidence")
    }
}

#[async_trait]
impl CriteriaRepository for UnexpectedDomainCalls {
    async fn get(&self, _: CriterionId) -> Result<Criterion, DomainError> {
        panic!("RA18 lifecycle fixture must not read clinical criteria")
    }

    async fn live_for_payer(&self, _: &str) -> Result<Vec<Criterion>, DomainError> {
        panic!("RA18 lifecycle fixture must not read payer criteria")
    }
}

#[async_trait]
impl LetterRepository for UnexpectedDomainCalls {
    async fn get(&self, _: LetterId) -> Result<Letter, DomainError> {
        panic!("RA18 lifecycle fixture must not read a clinical letter")
    }

    async fn unresolved_non_policy_retrievals(
        &self,
        _: LetterId,
    ) -> Result<Vec<CriterionId>, DomainError> {
        panic!("RA18 lifecycle fixture must not read letter retrievals")
    }

    async fn sign(
        &self,
        _: LetterId,
        _: ActorId,
        _: chrono::DateTime<Utc>,
    ) -> Result<Letter, DomainError> {
        panic!("RA18 lifecycle fixture must not sign a letter")
    }
}

#[async_trait]
impl AuthorityPort for UnexpectedDomainCalls {
    async fn holds(&self, _: ActorId, _: Capability) -> Result<bool, DomainError> {
        panic!("RA18 lifecycle fixture must not resolve clinical authority")
    }
}

impl Clock for UnexpectedDomainCalls {
    fn now(&self) -> chrono::DateTime<Utc> {
        panic!("RA18 lifecycle fixture must not use the unexpected clock")
    }
}

fn fixture_state() -> DesktopState {
    let unused = Arc::new(UnexpectedDomainCalls);
    DesktopState {
        services: Arc::new(AppServices {
            cases: unused.clone(),
            evidence: unused.clone(),
            criteria: unused.clone(),
            letters: unused.clone(),
            authority: unused,
            clock: Arc::new(SystemClock),
            sessions: Arc::new(FixtureSessions),
        }),
        native_session: Arc::new(FixtureCredential),
        native_commands: Arc::new(UnavailableNativeClinicalCommands),
        ipc_authority: Arc::new(NativeIpcAuthority::new(["main", "secondary"], 0)),
    }
}

fn build_fixture_window(
    app: &AppHandle<Wry>,
    label: &str,
    role: &str,
    page: &str,
) -> tauri::Result<WebviewWindow<Wry>> {
    let force_shared_view_state = std::env::var_os("RA18_FORCE_SHARED_VIEW_STATE").is_some();
    let init = format!(
        "window.__RA18_ROLE__ = {}; window.__RA18_FORCE_SHARED_VIEW_STATE__ = {};",
        serde_json::to_string(role).expect("fixture role serializes"),
        force_shared_view_state
    );
    WebviewWindowBuilder::new(
        app,
        label,
        WebviewUrl::CustomProtocol(
            format!("ra18fixture://localhost/{page}")
                .parse()
                .expect("fixture URL is valid"),
        ),
    )
    .title(format!("RA18 {role}"))
    .initialization_script(init)
    .build()
}

fn text_field<'a>(payload: &'a Value, name: &str) -> Result<&'a str, String> {
    payload
        .get(name)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("receipt field {name} is missing: {payload}"))
}

fn next_receipt(
    receipts: &mpsc::Receiver<Receipt>,
    expected_window: &str,
    expected_stage: &str,
) -> Result<Receipt, String> {
    next_receipt_with_timeout(receipts, expected_window, expected_stage, RECEIPT_TIMEOUT)
}

fn next_receipt_with_timeout(
    receipts: &mpsc::Receiver<Receipt>,
    expected_window: &str,
    expected_stage: &str,
    timeout: Duration,
) -> Result<Receipt, String> {
    let receipt = receipts
        .recv_timeout(timeout)
        .map_err(|error| format!("timed out waiting for {expected_stage}: {error}"))?;
    let stage = text_field(&receipt.payload, "stage")?;
    if stage == "failure" {
        return Err(format!(
            "{} window fixture failed: {}",
            receipt.window, receipt.payload
        ));
    }
    if receipt.window != expected_window || stage != expected_stage {
        return Err(format!(
            "expected {expected_window}/{expected_stage}, received {}/{}",
            receipt.window, stage
        ));
    }
    Ok(receipt)
}

fn next_pglite_receipt(
    receipts: &mpsc::Receiver<Receipt>,
    expected_stage: &str,
) -> Result<Receipt, String> {
    let deadline = Instant::now() + PGLITE_RECEIPT_TIMEOUT;
    let mut last_progress = "benchmark-dispatched".to_owned();
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(format!(
                "timed out waiting for {expected_stage} after {last_progress}"
            ));
        }
        let receipt = receipts.recv_timeout(remaining).map_err(|error| {
            format!("timed out waiting for {expected_stage} after {last_progress}: {error}")
        })?;
        let stage = text_field(&receipt.payload, "stage")?;
        if receipt.window != "secondary" {
            return Err(format!(
                "expected secondary PGlite receipt, received {}/{}",
                receipt.window, stage
            ));
        }
        if stage == "failure" {
            return Err(format!(
                "{} window fixture failed: {}",
                receipt.window, receipt.payload
            ));
        }
        if stage == "pglite-progress" {
            last_progress = text_field(&receipt.payload, "step")?.to_owned();
            eprintln!("RA18_PGLITE_PROGRESS {}", receipt.payload);
            continue;
        }
        if stage == expected_stage {
            return Ok(receipt);
        }
        return Err(format!(
            "expected secondary/{expected_stage}, received {}/{}",
            receipt.window, stage,
        ));
    }
}

fn number_field(payload: &Value, name: &str) -> Result<f64, String> {
    payload
        .get(name)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite() && *value >= 0.0)
        .ok_or_else(|| format!("receipt field {name} is not a non-negative number: {payload}"))
}

fn integer_field(payload: &Value, name: &str) -> Result<u64, String> {
    payload
        .get(name)
        .and_then(Value::as_u64)
        .ok_or_else(|| format!("receipt field {name} is not a non-negative integer: {payload}"))
}

fn fixture_content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("wasm") => "application/wasm",
        Some("data") => "application/octet-stream",
        Some("tgz") => "application/gzip",
        _ => "application/octet-stream",
    }
}

fn fixture_asset_response(
    request: &tauri::http::Request<Vec<u8>>,
) -> tauri::http::Response<Vec<u8>> {
    let relative = request.uri().path().trim_start_matches('/');
    let relative = if relative.is_empty() {
        PathBuf::from("index.html")
    } else {
        PathBuf::from(relative)
    };
    if relative
        .components()
        .any(|component| !matches!(component, Component::Normal(_)))
    {
        return tauri::http::Response::builder()
            .status(400)
            .body(b"invalid fixture asset path".to_vec())
            .expect("fixture rejection response is valid");
    }

    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../web/dist-ra18")
        .join(relative);
    match fs::read(&path) {
        Ok(body) => tauri::http::Response::builder()
            .header(
                tauri::http::header::CONTENT_TYPE,
                fixture_content_type(&path),
            )
            .body(body)
            .expect("fixture asset response is valid"),
        Err(error) => tauri::http::Response::builder()
            .status(404)
            .body(format!("fixture asset missing: {error}").into_bytes())
            .expect("fixture missing response is valid"),
    }
}

fn require_code(payload: &Value, field: &str, expected: &str) -> Result<(), String> {
    let actual = text_field(payload, field)?;
    if actual != expected {
        return Err(format!("expected {field}={expected}, received {actual}"));
    }
    Ok(())
}

fn wait_for_window_destroyed(app: &AppHandle<Wry>, label: &str) -> Result<(), String> {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if app.get_webview_window(label).is_none() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(25));
    }
    Err(format!("window {label} did not reach Destroyed"))
}

fn run_fixture(app: AppHandle<Wry>, receipts: mpsc::Receiver<Receipt>) -> Result<Value, String> {
    let owner = next_receipt(&receipts, "main", "owner-ready")?;
    if app.webview_windows().len() != 1 {
        return Err("owner receipt did not occur with exactly one native window".into());
    }
    let owner_graph = text_field(&owner.payload, "graphId")?.to_owned();

    build_fixture_window(&app, "secondary", "follower", "index.html")
        .map_err(|error| format!("failed to create secondary native window: {error}"))?;
    let follower = next_receipt(&receipts, "secondary", "follower-ready")?;
    if app.webview_windows().len() != 2 {
        return Err("follower receipt did not occur with exactly two native windows".into());
    }
    if text_field(&follower.payload, "graphId")? != owner_graph {
        return Err("owner and follower received different canonical graphs".into());
    }
    if owner.payload["caseLabel"] != follower.payload["caseLabel"]
        || owner.payload["caseIds"] != follower.payload["caseIds"]
    {
        return Err(format!(
            "owner and follower received different entity/list content: owner={}, follower={}",
            owner.payload, follower.payload
        ));
    }
    if owner.payload["viewScope"]["identityId"] != follower.payload["viewScope"]["identityId"]
        || owner.payload["viewScope"]["practiceId"] != follower.payload["viewScope"]["practiceId"]
        || owner.payload["viewScope"]["caseId"] != follower.payload["viewScope"]["caseId"]
    {
        return Err("owner and follower view state did not refer to the same case scope".into());
    }
    if owner.payload["viewScope"]["viewInstanceId"]
        == follower.payload["viewScope"]["viewInstanceId"]
        || owner.payload["viewState"] == follower.payload["viewState"]
    {
        return Err(format!(
            "window-local view state was shared: owner={}, follower={}",
            owner.payload["viewState"], follower.payload["viewState"]
        ));
    }
    require_code(
        &follower.payload,
        "ownerDeniedCode",
        "native_replica_owner_denied",
    )?;

    let main = app
        .get_webview_window("main")
        .ok_or_else(|| "main native window disappeared before close".to_owned())?;
    if std::env::var_os("RA18_KEEP_OWNER_ALIVE").is_some() {
        main.hide()
            .map_err(|error| format!("failed to hide retained owner: {error}"))?;
    } else {
        main.close()
            .map_err(|error| format!("failed to close main native window: {error}"))?;
        wait_for_window_destroyed(&app, "main")?;
    }
    app.get_webview_window("secondary")
        .ok_or_else(|| "secondary native window disappeared".to_owned())?
        .eval("window.ra18AfterOwnerClose()")
        .map_err(|error| format!("failed to start handover stage: {error}"))?;

    let handover = next_receipt(&receipts, "secondary", "handover-ready")?;
    if text_field(&handover.payload, "oldGraphId")? == text_field(&handover.payload, "graphId")? {
        return Err("owner handover reused the released graph".into());
    }
    require_code(
        &handover.payload,
        "staleClaimCode",
        "native_replica_claim_not_found",
    )?;
    require_code(
        &handover.payload,
        "duplicateCode",
        "native_replica_revision_conflict",
    )?;

    app.get_webview_window("secondary")
        .ok_or_else(|| "secondary native window disappeared before identity change".to_owned())?
        .eval("window.ra18IdentityChange()")
        .map_err(|error| format!("failed to start identity stage: {error}"))?;
    let identity = next_receipt(&receipts, "secondary", "identity-ready")?;
    if text_field(&identity.payload, "oldGraphId")? == text_field(&identity.payload, "graphId")? {
        return Err("identity change reused the revoked graph".into());
    }
    require_code(&identity.payload, "staleReadCode", "native_epoch_stale")?;
    require_code(&identity.payload, "staleWriteCode", "native_epoch_stale")?;

    let skip_pglite_benchmark = std::env::var_os("RA18_SKIP_PGLITE_BENCHMARK").is_some();
    let measurement_payload = if skip_pglite_benchmark {
        Value::Null
    } else {
        let measurement_id = Uuid::new_v4();
        let storage_name = format!("aso-ra18-{measurement_id}");
        let cold_script = format!(
            "window.ra18StartPGliteBenchmark('cold', {});",
            serde_json::to_string(&storage_name).expect("fixture storage name serializes")
        );
        app.get_webview_window("secondary")
            .ok_or_else(|| {
                "secondary native window disappeared before PGlite benchmark".to_owned()
            })?
            .eval(&cold_script)
            .map_err(|error| format!("failed to start cold PGlite benchmark: {error}"))?;
        let cold = next_pglite_receipt(&receipts, "pglite-cold-measured")?;
        require_code(&cold.payload, "pgliteVersion", "0.5.8")?;
        require_code(&cold.payload, "storageMode", "idb")?;
        for field in ["coldFirstRowMs", "catchUpMs", "coldTeardownMs"] {
            number_field(&cold.payload, field)?;
        }
        if integer_field(&cold.payload, "catchUpRows")? != 250 {
            return Err(format!(
                "expected catchUpRows=250, received {}",
                cold.payload["catchUpRows"]
            ));
        }
        if integer_field(&cold.payload, "committedRows")? != 251 {
            return Err(format!(
                "expected committedRows=251, received {}",
                cold.payload["committedRows"]
            ));
        }

        let warm_script = format!(
            "window.ra18StartPGliteBenchmark('warm', {});",
            serde_json::to_string(&storage_name).expect("fixture storage name serializes")
        );
        app.get_webview_window("secondary")
            .ok_or_else(|| "cold PGlite window disappeared before reopen".to_owned())?
            .eval(&warm_script)
            .map_err(|error| format!("failed to start warm PGlite benchmark: {error}"))?;
        let warm = next_pglite_receipt(&receipts, "pglite-warm-measured")?;
        require_code(&warm.payload, "pgliteVersion", "0.5.8")?;
        require_code(&warm.payload, "storageMode", "idb")?;
        for field in ["warmFirstRowMs", "warmTeardownMs"] {
            number_field(&warm.payload, field)?;
        }
        if integer_field(&warm.payload, "persistedRows")? != 251 {
            return Err(format!(
                "expected persistedRows=251, received {}",
                warm.payload["persistedRows"]
            ));
        }
        if warm.payload["persistenceRoundTrip"] != Value::Bool(true) {
            return Err(format!("persistence round trip failed: {}", warm.payload));
        }
        if warm.payload["syntheticDatabaseDeleted"] != Value::Bool(true) {
            return Err(format!(
                "synthetic IndexedDB cleanup failed: {}",
                warm.payload
            ));
        }
        app.get_webview_window("secondary")
            .ok_or_else(|| "warm PGlite window disappeared before cleanup".to_owned())?
            .close()
            .map_err(|error| format!("failed to close warm PGlite window: {error}"))?;
        wait_for_window_destroyed(&app, "secondary")?;
        json!({
            "pgliteVersion": cold.payload["pgliteVersion"],
            "storageMode": cold.payload["storageMode"],
            "coldFirstRowMs": cold.payload["coldFirstRowMs"],
            "catchUpMs": cold.payload["catchUpMs"],
            "catchUpRows": cold.payload["catchUpRows"],
            "coldTeardownMs": cold.payload["coldTeardownMs"],
            "warmFirstRowMs": warm.payload["warmFirstRowMs"],
            "warmTeardownMs": warm.payload["warmTeardownMs"],
            "persistedRows": warm.payload["persistedRows"],
            "persistenceRoundTrip": warm.payload["persistenceRoundTrip"],
            "webviewRestart": false,
            "syntheticDatabaseDeleted": warm.payload["syntheticDatabaseDeleted"],
        })
    };

    Ok(json!({
        "result": "Passed",
        "runtime": "tauri-wry",
        "oneWindowOwnerGraph": owner_graph,
        "twoWindowFollowerRevision": follower.payload["revision"],
        "sharedCaseLabel": follower.payload["caseLabel"],
        "sharedCaseIds": follower.payload["caseIds"],
        "ownerViewScope": owner.payload["viewScope"],
        "ownerViewState": owner.payload["viewState"],
        "followerViewScope": follower.payload["viewScope"],
        "followerViewState": follower.payload["viewState"],
        "handoverGraph": handover.payload["graphId"],
        "identityGraph": identity.payload["graphId"],
        "ownerCloseObserved": true,
        "staleOwnerWrite": handover.payload["staleClaimCode"],
        "duplicateCommit": handover.payload["duplicateCode"],
        "staleIdentityRead": identity.payload["staleReadCode"],
        "staleIdentityWrite": identity.payload["staleWriteCode"],
        "pgliteBenchmark": if skip_pglite_benchmark { "skipped-non-measurement-acceptance" } else { "passed" },
        "measurements": measurement_payload,
    }))
}

fn main() {
    let (receipt_tx, receipt_rx) = mpsc::channel();
    let fixture_exit_code = Arc::new(AtomicI32::new(1));
    let thread_exit_code = Arc::clone(&fixture_exit_code);
    let native_builder = tauri::Builder::default()
        .register_uri_scheme_protocol("ra18fixture", |_, request| {
            fixture_asset_response(&request)
        })
        .on_page_load(|webview, payload| {
            if payload.event() != tauri::webview::PageLoadEvent::Finished {
                return;
            }
            let label = webview.label().to_owned();
            let _ = webview.eval_with_callback(
                "JSON.stringify({href:location.href,title:document.title,status:document.querySelector('#status')?.textContent,role:window.__RA18_ROLE__,hasInternals:Boolean(window.__TAURI_INTERNALS__),isTauri:window.isTauri === true})",
                move |value| eprintln!("RA18_PAGE {label} {value}"),
            );
        });
    let builder = configure_tauri(native_builder, fixture_state()).setup(move |app| {
        app.listen("ra18://receipt", move |event| {
            let payload = serde_json::from_str::<Value>(event.payload()).unwrap_or_else(
                |error| json!({"stage":"failure", "message":format!("invalid receipt: {error}")}),
            );
            let window = match payload.get("role").and_then(Value::as_str) {
                Some("owner") => "main",
                Some("follower") => "secondary",
                Some("measurement") => "secondary",
                _ => "unknown",
            };
            let _ = receipt_tx.send(Receipt {
                window: window.into(),
                payload,
            });
        });
        let handle = app.handle().clone();
        thread::spawn(move || {
            let result = (|| {
                let configured_windows = handle.webview_windows().into_values().collect::<Vec<_>>();
                let configured_labels = configured_windows
                    .iter()
                    .map(|window| window.label().to_owned())
                    .collect::<Vec<_>>();
                for window in configured_windows {
                    window
                        .close()
                        .map_err(|error| format!("failed to close configured window: {error}"))?;
                }
                for label in configured_labels {
                    wait_for_window_destroyed(&handle, &label)?;
                }
                build_fixture_window(&handle, "main", "owner", "index.html")
                    .map_err(|error| format!("failed to create main native window: {error}"))?;
                run_fixture(handle.clone(), receipt_rx)
            })();
            match result {
                Ok(evidence) => {
                    println!("{evidence}");
                    thread_exit_code.store(0, Ordering::SeqCst);
                    handle.exit(0);
                }
                Err(error) => {
                    eprintln!("RA18 native lifecycle fixture failed: {error}");
                    thread_exit_code.store(1, Ordering::SeqCst);
                    handle.exit(1);
                }
            }
        });
        Ok(())
    });

    let app = builder
        .build(tauri::generate_context!("tauri.ra18.conf.json"))
        .expect("failed to build RA18 native lifecycle fixture");
    app.run_return(|_, event| {
        if let tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            api.prevent_exit();
        }
    });
    std::process::exit(fixture_exit_code.load(Ordering::SeqCst));
}
