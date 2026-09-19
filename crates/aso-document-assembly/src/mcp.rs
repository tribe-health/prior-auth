//! Official MCP Streamable HTTP adapter. Each invocation reads current request
//! credentials; no session or transport stores an authenticated principal.
use crate::{
    routes::AgentState,
    task_host::{CallerHeaders, StartTask, TaskReference},
};
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    model::*,
    service::RequestContext,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use serde_json::{Value, json};
use std::borrow::Cow;
const APP_URI: &str = "ui://aso/document-workspace";

fn add_app_presentation(value: &mut Value, web_public_url: Option<&str>) {
    let Some(base) = web_public_url else { return };
    let Some(case_id) = value
        .get("letter")
        .and_then(|letter| letter.get("caseId"))
        .and_then(Value::as_str)
        .filter(|value| uuid::Uuid::parse_str(value).is_ok())
    else {
        return;
    };
    value["presentation"] = json!({
        "sourceReviewUrl": format!("{base}/cases/{case_id}/evidence")
    });
}
#[derive(Clone)]
pub struct DocumentMcp {
    state: AgentState,
}
pub fn service(state: AgentState) -> StreamableHttpService<DocumentMcp, LocalSessionManager> {
    let mut config = StreamableHttpServerConfig::default()
        .with_legacy_session_mode(false)
        .enforce_origin_validation();
    config.allowed_origins = (*state.allowed_origins).clone();
    if let Ok(url) = reqwest::Url::parse(&state.public_url)
        && let Some(host) = url.host_str()
    {
        config.allowed_hosts.push(host.to_string());
    }
    config.max_request_body_bytes = 64 * 1024;
    StreamableHttpService::new(
        move || {
            Ok(DocumentMcp {
                state: state.clone(),
            })
        },
        LocalSessionManager::default().into(),
        config,
    )
}
fn caller(context: &RequestContext<RoleServer>) -> Result<CallerHeaders, ErrorData> {
    let parts = context
        .extensions
        .get::<axum::http::request::Parts>()
        .ok_or_else(|| ErrorData::invalid_request("HTTP caller is required", None))?;
    CallerHeaders::from_request(&parts.headers)
        .map_err(|_| ErrorData::invalid_request("Authentication is required", None))
}
fn tool_definitions(app: bool) -> Vec<Tool> {
    let uuid = json!({"type":"string","format":"uuid"});
    let reference = json!({"type":"object","additionalProperties":false,"required":["practiceId","taskId"],"properties":{"practiceId":uuid,"taskId":uuid}});
    let start = json!({"type":"object","additionalProperties":false,"required":["practiceId","caseId","command"],"properties":{"practiceId":uuid,"caseId":uuid,"command":{"type":"object","additionalProperties":false,"required":["commandId","expectedRevisions","purpose"],"properties":{"commandId":uuid,"purpose":{"type":"string","enum":["prior_authorization_request","corrected_resubmission","clinical_appeal"]},"expectedRevisions":{"type":"object","additionalProperties":false,"required":["resolutionRevision","criteriaSelectionRevision","evidenceRevision"],"properties":{"resolutionRevision":{"type":"string"},"criteriaSelectionRevision":{"type":"string"},"evidenceRevision":{"type":"string"}}}}}}});
    [("start_draft","Start a provisional cited draft. This does not approve, sign, or submit.",start,false),("get_task","Read an owned document task.",reference.clone(),true),("cancel_task","Request cancellation of an owned document task.",reference.clone(),false),("artifacts","Read committed draft, claims, and QA artifacts.",reference,true)].into_iter().map(|(name,description,schema,read_only)|{
        let mut value=json!({"name":name,"description":description,"inputSchema":schema,"annotations":{"readOnlyHint":read_only,"destructiveHint":false,"openWorldHint":false}});
        if app && name=="artifacts" {value["_meta"]=json!({"ui":{"resourceUri":APP_URI,"visibility":["model","app"]}});}
        serde_json::from_value(value).expect("static tool schema")
    }).collect()
}
impl ServerHandler for DocumentMcp {
    fn supported_protocol_versions(&self) -> Cow<'static, [ProtocolVersion]> {
        Cow::Owned(vec![ProtocolVersion::V_2025_11_25])
    }
    fn get_info(&self) -> ServerConfig {
        let capabilities: ServerCapabilities =
            serde_json::from_value(if self.state.mcp_app_html.is_some() {
                json!({"tools":{},"resources":{}})
            } else {
                json!({"tools":{}})
            })
            .expect("static capabilities");
        ServerConfig::new(capabilities).with_protocol_version(ProtocolVersion::V_2025_11_25).with_server_info(Implementation::new("aso-document-assembly",env!("CARGO_PKG_VERSION"))).with_instructions("Only synthetic demo generation is enabled. A completed task is a provisional document and never clinical approval. Every operation requires the caller's current practice membership and task ownership.")
    }
    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        caller(&context)?;
        Ok(serde_json::from_value(
            json!({"tools":tool_definitions(self.state.mcp_app_html.is_some())}),
        )
        .expect("static tools"))
    }
    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let caller = caller(&context)?;
        let args = Value::Object(request.arguments.unwrap_or_default());
        let invalid = || ErrorData::invalid_params("Invalid task arguments", None);
        let operation = async {
            if request.name == "start_draft" {
                let start: StartTask = serde_json::from_value(args).map_err(|_| invalid())?;
                Ok(self
                    .state
                    .task_host
                    .start(&caller, &start)
                    .await
                    .map(|task| json!(task)))
            } else {
                if !matches!(
                    request.name.as_ref(),
                    "get_task" | "cancel_task" | "artifacts"
                ) {
                    return Err(ErrorData::invalid_params("Unknown tool", None));
                }
                let reference: TaskReference =
                    serde_json::from_value(args).map_err(|_| invalid())?;
                Ok(match request.name.as_ref() {
                    "get_task" => self
                        .state
                        .task_host
                        .get(&caller, &reference)
                        .await
                        .map(|task| json!(task)),
                    "cancel_task" => self
                        .state
                        .task_host
                        .cancel(&caller, &reference)
                        .await
                        .map(|task| json!(task)),
                    _ => {
                        let mut result = self.state.task_host.artifacts(&caller, &reference).await;
                        if let Ok(value) = &mut result {
                            add_app_presentation(value, self.state.web_public_url.as_deref());
                        }
                        result
                    }
                })
            }
        };
        let outcome = tokio::select! {_=context.ct.cancelled()=>return Ok(CallToolResult::error(vec![ContentBlock::text("Request canceled; use get_task to reconcile durable task state.")]).into()),outcome=operation=>outcome?};
        let result:CallToolResult=match outcome{
            Ok(value)=>serde_json::from_value(json!({"content":[{"type":"text","text":value.to_string()}],"structuredContent":value,"isError":false})).map_err(|_|ErrorData::internal_error("Task result serialization failed",None))?,
            Err(error)=>CallToolResult::error(vec![ContentBlock::text(format!("Document task refused: {} ({})",error.code,error.status.as_u16()))]),
        };
        Ok(result.into())
    }
    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        context: RequestContext<RoleServer>,
    ) -> Result<ListResourcesResult, ErrorData> {
        caller(&context)?;
        let resources = if self.state.mcp_app_html.is_some() {
            json!([{"uri":APP_URI,"name":"document-workspace","mimeType":"text/html;profile=mcp-app"}])
        } else {
            json!([])
        };
        Ok(serde_json::from_value(json!({"resources":resources})).expect("static resources"))
    }
    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<ReadResourceResponse, ErrorData> {
        caller(&context)?;
        let html = self
            .state
            .mcp_app_html
            .as_ref()
            .filter(|_| request.uri == APP_URI)
            .ok_or_else(|| ErrorData::resource_not_found("Unknown resource", None))?;
        let result:ReadResourceResult=serde_json::from_value(json!({"contents":[{"uri":APP_URI,"mimeType":"text/html;profile=mcp-app","text":html.as_ref(),"_meta":{"ui":{"csp":{"connectDomains":[],"resourceDomains":[],"frameDomains":[],"baseUriDomains":[]}}}}]})).expect("static resource envelope");
        Ok(result.into())
    }
}

#[cfg(test)]
mod tests {
    use super::add_app_presentation;
    use serde_json::json;

    #[test]
    fn app_source_review_url_targets_the_mounted_evidence_route() {
        let mut artifacts = json!({
            "letter": {"caseId": "10000000-0000-4000-8000-000000000005"}
        });

        add_app_presentation(&mut artifacts, Some("https://demo.example"));

        assert_eq!(
            artifacts["presentation"]["sourceReviewUrl"],
            "https://demo.example/cases/10000000-0000-4000-8000-000000000005/evidence"
        );
    }
}
