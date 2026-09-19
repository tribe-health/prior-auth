//! A2A 0.3.0 JSON-RPC facade over the same host-owned document tasks.
use crate::{
    routes::AgentState,
    task_host::{CallerHeaders, DocumentTask, TaskInput, TaskReference},
};
use axum::{
    Json,
    extract::State,
    http::HeaderMap,
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{Value, json};

pub async fn card(State(state): State<AgentState>) -> Json<Value> {
    Json(
        json!({"name":"ASO Document Assembly","description":"Produces provisional, cited document drafts. Completion is not clinical approval or signature.","protocolVersion":"0.3.0","version":env!("CARGO_PKG_VERSION"),"url":format!("{}/a2a",state.public_url.trim_end_matches('/')),"preferredTransport":"JSONRPC","capabilities":{"streaming":true,"pushNotifications":false},"defaultInputModes":["application/json"],"defaultOutputModes":["application/json"],"securitySchemes":{"session":{"type":"apiKey","in":"header","name":"X-Session-Token"},"bearer":{"type":"http","scheme":"bearer"}},"security":[{"session":[]},{"bearer":[]}],"skills":[
            {"id":"initial_request","name":"Initial request draft","description":"Generate a cited prior authorization draft from authorized case data.","tags":["document","draft"]},
            {"id":"corrected_resubmission","name":"Corrected resubmission draft","description":"Draft a linked corrected resubmission.","tags":["document","draft"]},
            {"id":"clinical_appeal","name":"Clinical appeal draft","description":"Draft a clinical appeal after fresh surgeon affirmation.","tags":["document","draft"]}
        ]}),
    )
}
#[derive(Deserialize)]
struct Rpc {
    jsonrpc: String,
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}
fn error(id: Value, code: i32, message: &str) -> Response {
    Json(json!({"jsonrpc":"2.0","id":id,"error":{"code":code,"message":message}})).into_response()
}
fn result(id: Value, value: Value) -> Response {
    Json(json!({"jsonrpc":"2.0","id":id,"result":value})).into_response()
}
fn task_value(task: &DocumentTask) -> Value {
    json!({"kind":"task","id":task.id,"contextId":task.case_id,"status":{"state":task.state,"timestamp":task.updated_at},"metadata":{"practiceScoped":true,"stage":task.stage,"clinicallyApproved":false,"lastSequence":task.last_sequence}})
}
fn reference(params: &Value) -> Option<TaskReference> {
    Some(TaskReference {
        task_id: serde_json::from_value(params.get("id")?.clone()).ok()?,
        practice_id: serde_json::from_value(params.get("metadata")?.get("practiceId")?.clone())
            .ok()?,
    })
}
async fn with_artifacts(
    state: &AgentState,
    caller: &CallerHeaders,
    reference: &TaskReference,
    task: &DocumentTask,
) -> Result<Value, crate::task_host::HostError> {
    let mut value = task_value(task);
    if task.state == "completed" {
        let artifacts = state.task_host.artifacts(caller, reference).await?;
        value["artifacts"] = json!([{"artifactId":format!("{}:document",task.id),"name":"Committed draft, claims and QA","parts":[{"kind":"data","data":artifacts}]}]);
    }
    Ok(value)
}
pub async fn handle(
    State(state): State<AgentState>,
    headers: HeaderMap,
    body: Result<Json<Value>, axum::extract::rejection::JsonRejection>,
) -> Response {
    let value = match body {
        Ok(Json(value)) => value,
        Err(_) => return error(Value::Null, -32700, "Invalid JSON"),
    };
    let rpc = match serde_json::from_value::<Rpc>(value) {
        Ok(rpc) if rpc.jsonrpc == "2.0" && (rpc.id.is_string() || rpc.id.is_number()) => rpc,
        _ => return error(Value::Null, -32600, "Invalid JSON-RPC request"),
    };
    let caller = match CallerHeaders::from_request(&headers) {
        Ok(caller) => caller,
        Err(error) => return error.into_response(),
    };
    let streaming = matches!(rpc.method.as_str(), "message/stream" | "tasks/resubscribe");
    let task_result = match rpc.method.as_str() {
        "message/send" | "message/stream" => {
            let message = &rpc.params["message"];
            if message["kind"] != "message"
                || message["role"] != "user"
                || !message["messageId"].is_string()
                || rpc.params["configuration"]
                    .get("pushNotificationConfig")
                    .is_some()
            {
                return error(
                    rpc.id,
                    -32602,
                    "A user data message is required; push notifications are unsupported",
                );
            }
            let Some(parts) = message["parts"].as_array().filter(|parts| parts.len() == 1) else {
                return error(rpc.id, -32602, "Exactly one task data part is required");
            };
            if parts[0]["kind"] != "data" {
                return error(
                    rpc.id,
                    -32005,
                    "Only application/json task input is supported",
                );
            }
            let input = match serde_json::from_value::<TaskInput>(parts[0]["data"].clone()) {
                Ok(input) => input,
                Err(_) => return error(rpc.id, -32602, "Invalid task input"),
            };
            if let Some(id) = message.get("taskId") {
                let TaskInput::Existing(reference) = input else {
                    return error(
                        rpc.id,
                        -32602,
                        "Existing task messages require a task reference",
                    );
                };
                if id.as_str() != Some(&reference.task_id.to_string()) {
                    return error(rpc.id, -32602, "Task reference mismatch");
                }
                state
                    .task_host
                    .resume(&caller, &reference)
                    .await
                    .map(|task| (reference, task))
            } else {
                state.task_host.resolve(&caller, input).await
            }
        }
        "tasks/get" | "tasks/cancel" | "tasks/resubscribe" => {
            let Some(reference) = reference(&rpc.params) else {
                return error(
                    rpc.id,
                    -32602,
                    "Task id and metadata.practiceId are required",
                );
            };
            let response = if rpc.method == "tasks/cancel" {
                state.task_host.cancel(&caller, &reference).await
            } else {
                state.task_host.get(&caller, &reference).await
            };
            response.map(|task| (reference, task))
        }
        _ => return error(rpc.id, -32601, "Method not found"),
    };
    let (reference, mut task) = match task_result {
        Ok(result) => result,
        Err(failure) => {
            return match failure.status.as_u16() {
                401 | 403 => failure.into_response(),
                404 => error(rpc.id, -32001, "Task not found"),
                409 if rpc.method == "tasks/cancel" => {
                    error(rpc.id, -32002, "Task cannot be canceled")
                }
                409 => error(rpc.id, -32004, "Task operation is not available"),
                _ => error(rpc.id, -32603, "Task host request failed"),
            };
        }
    };
    if !streaming {
        if rpc.method == "message/send" && rpc.params["configuration"]["blocking"] == true {
            let wait = async {
                while !task.terminal() && !task.paused() {
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    task = state.task_host.get(&caller, &reference).await?;
                }
                Ok::<_, crate::task_host::HostError>(())
            };
            if let Ok(Err(error)) =
                tokio::time::timeout(std::time::Duration::from_secs(25), wait).await
            {
                return error.into_response();
            }
        }
        return match with_artifacts(&state, &caller, &reference, &task).await {
            Ok(value) => result(rpc.id, value),
            Err(error) => error.into_response(),
        };
    }
    let (sender, receiver) = tokio::sync::mpsc::channel(8);
    tokio::spawn(async move {
        let initial = match with_artifacts(&state, &caller, &reference, &task).await {
            Ok(value) => value,
            Err(_) => return,
        };
        let first = axum::response::sse::Event::default()
            .json_data(json!({"jsonrpc":"2.0","id":rpc.id,"result":initial}))
            .expect("JSON task");
        if sender
            .send(Ok::<_, std::convert::Infallible>(first))
            .await
            .is_err()
        {
            return;
        }
        let mut previous_sequence = task.last_sequence;
        loop {
            let final_event = task.terminal() || task.paused();
            let status = json!({"kind":"status-update","taskId":task.id,"contextId":task.case_id,"status":{"state":task.state,"timestamp":task.updated_at},"final":final_event,"metadata":{"stage":task.stage}});
            let event = axum::response::sse::Event::default()
                .json_data(json!({"jsonrpc":"2.0","id":rpc.id,"result":status}))
                .expect("JSON status");
            if sender.send(Ok(event)).await.is_err() || final_event {
                return;
            }
            loop {
                tokio::select! {_=sender.closed()=>return,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{}}
                task = match tokio::select! {_=sender.closed()=>return,task=state.task_host.get(&caller,&reference)=>task}
                {
                    Ok(task) => task,
                    Err(_) => return,
                };
                if task.last_sequence != previous_sequence || task.terminal() || task.paused() {
                    previous_sequence = task.last_sequence;
                    break;
                }
            }
            if task.state == "completed" {
                let Ok(artifacts) = state.task_host.artifacts(&caller, &reference).await else {
                    return;
                };
                let artifact = json!({"kind":"artifact-update","taskId":task.id,"contextId":task.case_id,"artifact":{"artifactId":format!("{}:document",task.id),"parts":[{"kind":"data","data":artifacts}]},"append":false,"lastChunk":true});
                let event = axum::response::sse::Event::default()
                    .json_data(json!({"jsonrpc":"2.0","id":rpc.id,"result":artifact}))
                    .expect("JSON artifact");
                if sender.send(Ok(event)).await.is_err() {
                    return;
                }
            }
        }
    });
    axum::response::Sse::new(tokio_stream::wrappers::ReceiverStream::new(receiver))
        .keep_alive(axum::response::sse::KeepAlive::default())
        .into_response()
}
