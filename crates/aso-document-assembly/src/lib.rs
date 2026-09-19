//! Protocol-facing document assembly service. The shell-neutral engine renders
//! documents; caller-authenticated task operations delegate all persistence and
//! clinical authority to the trusted host.

pub mod a2a;
pub mod a2ui;
pub mod agui;
pub mod contract;
pub mod mcp;
pub mod packages;
pub mod routes;
pub mod service;
pub mod task_host;

pub use routes::{AgentState, router};

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    use super::*;
    use crate::packages::{Catalog, seed_root};

    fn state() -> AgentState {
        AgentState {
            catalog: Arc::new(Catalog::load(&seed_root()).unwrap()),
            task_host: crate::task_host::TaskHost::new("http://127.0.0.1:1").unwrap(),
            assembly_token: Arc::from("test-assembly-token"),
            public_url: Arc::from("http://127.0.0.1:8091"),
            web_public_url: Some(Arc::from("http://127.0.0.1:5173")),
            allowed_origins: Arc::new(vec!["http://127.0.0.1:5173".into()]),
            mcp_app_html: None,
        }
    }

    fn fixture(name: &str) -> serde_json::Value {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("fixtures")
            .join(name);
        serde_json::from_str(
            &std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display())),
        )
        .unwrap()
    }

    async fn body_json(resp: axum::response::Response) -> serde_json::Value {
        let bytes = axum::body::to_bytes(resp.into_body(), 1 << 20)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }

    #[tokio::test]
    async fn readiness_reports_the_seed_catalog() {
        let resp = router(state())
            .oneshot(Request::get("/readyz").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(v["ready"], true);
        assert!(v["kinds"].as_u64().unwrap() >= 3);
    }

    #[tokio::test]
    async fn the_initial_request_fixture_renders_a_cited_letter_over_rest() {
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(
                fixture("initial_request_lumbar_fusion.json").to_string(),
            ))
            .unwrap();
        let resp = router(state()).oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        let md = v["assembly"]["canonicalMarkdown"].as_str().unwrap();
        assert!(
            md.contains("Request for Pre-Service Organization Determination"),
            "{md}"
        );
        assert!(
            md.contains("(Flexion-extension radiograph report, p. 1, 2026-04-15)"),
            "{md}"
        );
        assert!(
            md.contains("In the clinical judgment of Adaeze Okafor, MD,"),
            "{md}"
        );
        assert!(
            !md.contains("Respectfully submitted"),
            "no signature block without a receipt"
        );
        assert_eq!(v["assembly"]["qa"].as_array().unwrap().len(), 7);
        assert_eq!(
            v["surfaces"].as_array().unwrap().len(),
            3,
            "approvable draft emits no halt memo"
        );
        assert!(
            v["assembly"]["contentSha256"]
                .as_str()
                .unwrap()
                .starts_with("sha256:")
        );
    }

    #[tokio::test]
    async fn a_body_carrying_an_actor_is_rejected_before_any_rendering() {
        let mut body = fixture("initial_request_lumbar_fusion.json");
        body["actor"] = serde_json::json!("did:aso:p:kjames");
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let resp = router(state()).oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn a_void_criterion_left_uncovered_halts_with_coordinator_routing() {
        let mut body = fixture("initial_request_lumbar_fusion.json");
        body["requiredCriteria"]
            .as_array_mut()
            .unwrap()
            .push(serde_json::json!("C6"));
        body["evidence"]["C6"] = serde_json::json!("void");
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        let resp = router(state()).oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        assert_eq!(
            v["assembly"]["qa"]
                .as_array()
                .unwrap()
                .iter()
                .find(|q| q["check"] == "criterion_coverage")
                .unwrap()["outcome"],
            "fail"
        );
        let halt = v["surfaces"]
            .as_array()
            .unwrap()
            .iter()
            .find(|s| s["surface"] == "HaltMemoBlock")
            .expect("halt memo surface");
        let routing = halt["props"]["routing"].as_array().unwrap();
        assert!(
            routing.iter().any(|r| r["criterion"] == "C6"
                && r["state"] == "void"
                && r["routesTo"] == "coordinator"),
            "{routing:?}"
        );
    }

    #[tokio::test]
    async fn the_denial_response_fixture_renders_the_appeal_kind() {
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(
                fixture("denial_response_clinical_appeal.json").to_string(),
            ))
            .unwrap();
        let resp = router(state()).oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        let md = v["assembly"]["canonicalMarkdown"].as_str().unwrap();
        assert!(md.contains("Second-level appeal"), "{md}");
        assert!(md.contains("Determination Being Appealed"), "{md}");
    }

    #[tokio::test]
    async fn the_halt_memo_kind_prints_states_and_routes_and_a_letter_kind_cannot() {
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(fixture("halt_memo.json").to_string()))
            .unwrap();
        let resp = router(state()).oneshot(req).await.unwrap();
        assert_eq!(resp.status(), StatusCode::OK);
        let v = body_json(resp).await;
        let md = v["assembly"]["canonicalMarkdown"].as_str().unwrap();
        assert!(md.contains("void") && md.contains("coordinator"), "{md}");
        assert!(md.contains("gap") && md.contains("clinician"), "{md}");
    }

    #[tokio::test]
    async fn an_unknown_kind_is_404_and_a_wrong_package_digest_is_409() {
        let mut body = fixture("initial_request_lumbar_fusion.json");
        body["kind"] = serde_json::json!("pa.nonexistent");
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        assert_eq!(
            router(state()).oneshot(req).await.unwrap().status(),
            StatusCode::NOT_FOUND
        );
        let mut body = fixture("initial_request_lumbar_fusion.json");
        body["expectedPackageDigest"] = serde_json::json!("sha256:0000");
        let req = Request::post("/v1/assemble")
            .header("authorization", "Bearer test-assembly-token")
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap();
        assert_eq!(
            router(state()).oneshot(req).await.unwrap().status(),
            StatusCode::CONFLICT
        );
    }

    #[tokio::test]
    async fn internal_assembly_requires_its_service_credential() {
        let request = Request::post("/v1/assemble")
            .header("content-type", "application/json")
            .body(Body::from(
                fixture("initial_request_lumbar_fusion.json").to_string(),
            ))
            .unwrap();
        assert_eq!(
            router(state()).oneshot(request).await.unwrap().status(),
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn public_agui_refuses_arbitrary_assembly_claims() {
        let request = Request::post("/agent/run").header("content-type", "application/json").header("x-session-token", "synthetic-caller").body(Body::from(serde_json::json!({"threadId":"t","runId":"r","forwardedProps":{"assembly":fixture("initial_request_lumbar_fusion.json")}}).to_string())).unwrap();
        assert_eq!(
            router(state()).oneshot(request).await.unwrap().status(),
            StatusCode::BAD_REQUEST
        );
    }
}

#[cfg(test)]
mod protocol_tests {
    use crate::{
        AgentState,
        packages::{Catalog, seed_root},
        router,
        task_host::TaskHost,
    };
    use axum::{
        Json, Router,
        body::Body,
        extract::{Path, Query, State},
        http::{HeaderMap, Request, StatusCode},
        response::{IntoResponse, Response},
        routing::{get, post},
    };
    use serde_json::{Value, json};
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };
    use tokio_stream::StreamExt;
    use tower::ServiceExt;
    const TASK: &str = "10000000-0000-4000-8000-000000000001";
    const CASE: &str = "10000000-0000-4000-8000-000000000002";
    const PRACTICE: &str = "10000000-0000-4000-8000-000000000003";
    #[derive(Clone)]
    struct FakeHost {
        calls: Arc<AtomicUsize>,
    }
    fn task(state: &str) -> Value {
        json!({"id":TASK,"caseId":CASE,"commandId":TASK,"purpose":"prior_authorization_request","state":state,"stage":"generation","createdAt":"2026-09-19T12:00:00Z","updatedAt":"2026-09-19T12:00:01Z","letterId":null,"errorCode":null,"lastSequence":2})
    }
    fn authorized(headers: &HeaderMap, query: &std::collections::HashMap<String, String>) -> bool {
        (headers
            .get("x-session-token")
            .is_some_and(|value| value == "owner")
            || headers
                .get("authorization")
                .is_some_and(|value| value == "Bearer owner"))
            && query
                .get("practiceId")
                .is_some_and(|value| value == PRACTICE)
            && !headers.contains_key("x-actor-id")
    }
    async fn get_task(
        headers: HeaderMap,
        Query(query): Query<std::collections::HashMap<String, String>>,
    ) -> Response {
        if !authorized(&headers, &query) {
            return StatusCode::NOT_FOUND.into_response();
        }
        Json(task("completed")).into_response()
    }
    async fn artifacts(
        headers: HeaderMap,
        Query(query): Query<std::collections::HashMap<String, String>>,
    ) -> Response {
        if !authorized(&headers, &query) {
            return StatusCode::NOT_FOUND.into_response();
        }
        Json(json!({"assembly":{"canonicalMarkdown":"Synthetic cited draft"},"letter":{"id":TASK}}))
            .into_response()
    }
    async fn cancel_task(
        headers: HeaderMap,
        Query(query): Query<std::collections::HashMap<String, String>>,
    ) -> Response {
        if !authorized(&headers, &query) {
            return StatusCode::NOT_FOUND.into_response();
        }
        Json(task("canceled")).into_response()
    }
    async fn events(
        State(host): State<FakeHost>,
        headers: HeaderMap,
        Query(query): Query<std::collections::HashMap<String, String>>,
    ) -> Response {
        if !authorized(&headers, &query) {
            return StatusCode::NOT_FOUND.into_response();
        }
        host.calls.fetch_add(1, Ordering::SeqCst);
        let after = query
            .get("afterSequence")
            .and_then(|value| value.parse::<i64>().ok())
            .unwrap();
        let events = if after == 0 {
            vec![
                json!({"taskId":TASK,"sequence":1,"occurredAt":"2026-09-19T12:00:00Z","eventType":"RUN_STARTED","payload":{"threadId":CASE,"runId":TASK}}),
            ]
        } else if after == 1 {
            vec![
                json!({"taskId":TASK,"sequence":2,"occurredAt":"2026-09-19T12:00:01Z","eventType":"RUN_FINISHED","payload":{"threadId":CASE,"runId":TASK}}),
            ]
        } else {
            vec![]
        };
        Json(events).into_response()
    }
    async fn start(
        Path(case): Path<String>,
        headers: HeaderMap,
        Query(query): Query<std::collections::HashMap<String, String>>,
        Json(body): Json<Value>,
    ) -> Response {
        if !authorized(&headers, &query) {
            return StatusCode::NOT_FOUND.into_response();
        }
        assert_eq!(case, CASE);
        assert_eq!(body["purpose"], "prior_authorization_request");
        assert_eq!(body.as_object().unwrap().len(), 3);
        Json(task("submitted")).into_response()
    }
    async fn fixture() -> (AgentState, FakeHost, tokio::task::JoinHandle<()>) {
        let host = FakeHost {
            calls: Arc::new(AtomicUsize::new(0)),
        };
        let fake = Router::new()
            .route("/api/document-tasks/{id}", get(get_task))
            .route("/api/document-tasks/{id}/cancel", post(cancel_task))
            .route("/api/document-tasks/{id}/artifacts", get(artifacts))
            .route("/api/document-tasks/{id}/events", get(events))
            .route("/api/cases/{id}/document-tasks", post(start))
            .with_state(host.clone());
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, fake).await.unwrap();
        });
        let state = AgentState {
            catalog: Arc::new(Catalog::load(&seed_root()).unwrap()),
            task_host: TaskHost::new(&format!("http://{address}")).unwrap(),
            assembly_token: Arc::from("internal"),
            public_url: Arc::from("http://127.0.0.1:8091"),
            web_public_url: Some(Arc::from("http://127.0.0.1:5173")),
            allowed_origins: Arc::new(vec!["http://127.0.0.1:5173".into()]),
            mcp_app_html: None,
        };
        (state, host, server)
    }
    fn request(path: &str, body: Value, token: &str) -> Request<Body> {
        Request::post(path)
            .header("host", "127.0.0.1:8091")
            .header("content-type", "application/json")
            .header("accept", "application/json, text/event-stream")
            .header("x-session-token", token)
            .header("x-actor-id", "must-not-forward")
            .header("mcp-protocol-version", "2025-11-25")
            .body(Body::from(body.to_string()))
            .unwrap()
    }
    async fn json(response: Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        serde_json::from_slice(&bytes).unwrap()
    }
    #[tokio::test]
    async fn agui_streams_persisted_events_and_resumes_without_replaying_earlier_frames() {
        let (state, host, server) = fixture().await;
        let body = json!({"threadId":CASE,"runId":TASK,"forwardedProps":{"task":{"practiceId":PRACTICE,"taskId":TASK}}});
        let response = router(state.clone())
            .oneshot(request("/agent/run", body.clone(), "owner"))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let mut stream = response.into_body().into_data_stream();
        let first = stream.next().await.unwrap().unwrap();
        let first = String::from_utf8(first.to_vec()).unwrap();
        assert!(first.contains("RUN_STARTED"));
        assert!(!first.contains("RUN_FINISHED"));
        assert_eq!(
            host.calls.load(Ordering::SeqCst),
            1,
            "first event is delivered before the next poll"
        );
        let mut rest = String::new();
        while let Some(bytes) = stream.next().await {
            rest.push_str(std::str::from_utf8(&bytes.unwrap()).unwrap());
        }
        assert!(rest.contains("RUN_FINISHED"));
        assert!(rest.contains(&format!("id: {TASK}:2")));
        let mut resume = request("/agent/run", body, "owner");
        resume
            .headers_mut()
            .insert("last-event-id", format!("{TASK}:1").parse().unwrap());
        let response = router(state).oneshot(resume).await.unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let resumed = String::from_utf8(bytes.to_vec()).unwrap();
        assert!(!resumed.contains("RUN_STARTED"));
        assert!(resumed.contains("RUN_FINISHED"));
        server.abort();
    }
    #[tokio::test]
    async fn a2a_uses_current_caller_for_task_get_and_cancel() {
        let (state, _, server) = fixture().await;
        for (token, expected) in [("owner", true), ("other", false)] {
            let response=router(state.clone()).oneshot(request("/a2a",json!({"jsonrpc":"2.0","id":1,"method":"tasks/get","params":{"id":TASK,"metadata":{"practiceId":PRACTICE}}}),token)).await.unwrap();
            let value = json(response).await;
            if !expected {
                assert_eq!(value["error"]["code"], -32001);
            } else {
                assert_eq!(
                    value["result"]["artifacts"][0]["parts"][0]["data"]["assembly"]["canonicalMarkdown"],
                    "Synthetic cited draft"
                );
            }
        }
        let response=router(state).oneshot(request("/a2a",json!({"jsonrpc":"2.0","id":2,"method":"tasks/cancel","params":{"id":TASK,"metadata":{"practiceId":PRACTICE}}}),"owner")).await.unwrap();
        let value = json(response).await;
        assert_eq!(value["result"]["kind"], "task");
        assert_eq!(value["result"]["status"]["state"], "canceled");
        server.abort();
    }
    async fn mcp_json(response: Response) -> Value {
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let text = std::str::from_utf8(&bytes).unwrap();
        if let Ok(value) = serde_json::from_str(text) {
            return value;
        }
        text.lines()
            .filter_map(|line| {
                line.strip_prefix("data: ")
                    .or_else(|| line.strip_prefix("data:"))
            })
            .find_map(|line| serde_json::from_str::<Value>(line).ok())
            .expect("MCP JSON or SSE JSON response")
    }
    #[tokio::test]
    async fn official_mcp_negotiation_and_each_invocation_uses_its_own_caller() {
        let (state, _, server) = fixture().await;
        let response=router(state.clone()).oneshot(request("/mcp",json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"synthetic-test","version":"1"}}}),"owner")).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert!(!response.headers().contains_key("mcp-session-id"));
        let value = mcp_json(response).await;
        assert_eq!(value["result"]["protocolVersion"], "2025-11-25");
        assert!(value["result"]["capabilities"].get("tasks").is_none());
        let response = router(state.clone())
            .oneshot(request(
                "/mcp",
                json!({"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}),
                "owner",
            ))
            .await
            .unwrap();
        let value = mcp_json(response).await;
        assert_eq!(value["result"]["tools"].as_array().unwrap().len(), 4);
        for (token, is_error) in [("owner", false), ("other", true)] {
            let response=router(state.clone()).oneshot(request("/mcp",json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_task","arguments":{"practiceId":PRACTICE,"taskId":TASK}}}),token)).await.unwrap();
            let value = mcp_json(response).await;
            assert_eq!(value["result"]["isError"], is_error, "{value}");
        }
        server.abort();
    }
    #[tokio::test]
    async fn cookie_writes_reject_missing_or_unapproved_origin() {
        let (state, _, server) = fixture().await;
        for origin in [None, Some("https://unrelated.example")] {
            let mut request = Request::post("/agent/cancel")
                .header("cookie", "session=synthetic")
                .header("content-type", "application/json");
            if let Some(origin) = origin {
                request = request.header("origin", origin);
            }
            let response = router(state.clone())
                .oneshot(
                    request
                        .body(Body::from(
                            json!({"practiceId":PRACTICE,"taskId":TASK}).to_string(),
                        ))
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }
        server.abort();
    }
    #[tokio::test]
    async fn bearer_is_forwarded_and_ambiguous_credentials_are_refused() {
        let (state, _, server) = fixture().await;
        let body = json!({"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_task","arguments":{"practiceId":PRACTICE,"taskId":TASK}}});
        let mut bearer = request("/mcp", body.clone(), "owner");
        bearer.headers_mut().remove("x-session-token");
        bearer
            .headers_mut()
            .insert("authorization", "Bearer owner".parse().unwrap());
        let response = router(state.clone()).oneshot(bearer).await.unwrap();
        assert_eq!(mcp_json(response).await["result"]["isError"], false);
        for mixed in [false, true] {
            let mut ambiguous = request("/mcp", body.clone(), "owner");
            if mixed {
                ambiguous
                    .headers_mut()
                    .insert("authorization", "Bearer other".parse().unwrap());
            } else {
                ambiguous
                    .headers_mut()
                    .append("x-session-token", "other".parse().unwrap());
            }
            let response = router(state.clone()).oneshot(ambiguous).await.unwrap();
            let value = mcp_json(response).await;
            assert!(value.get("error").is_some(), "{value}");
        }
        server.abort();
    }
    #[tokio::test]
    async fn agui_start_forwards_only_typed_command_and_mcp_requires_valid_protocol_requests() {
        let (state, _, server) = fixture().await;
        let start = json!({"practiceId":PRACTICE,"caseId":CASE,"command":{"commandId":TASK,"purpose":"prior_authorization_request","expectedRevisions":{"resolutionRevision":"1","criteriaSelectionRevision":"2","evidenceRevision":"3"}}});
        let response = router(state.clone())
            .oneshot(request(
                "/agent/run",
                json!({"threadId":CASE,"runId":TASK,"forwardedProps":{"task":start}}),
                "owner",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        assert!(
            std::str::from_utf8(&bytes)
                .unwrap()
                .contains("RUN_FINISHED")
        );
        let response = router(state.clone())
            .oneshot(request(
                "/mcp",
                json!({"jsonrpc":"2.0","method":"notifications/initialized"}),
                "owner",
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::ACCEPTED);
        let response = router(state)
            .oneshot(
                Request::get("/mcp")
                    .header("host", "127.0.0.1:8091")
                    .header("accept", "text/event-stream")
                    .header("x-session-token", "owner")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::METHOD_NOT_ALLOWED);
        server.abort();
    }
}
