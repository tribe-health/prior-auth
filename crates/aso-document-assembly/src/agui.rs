//! AG-UI wire types: the bidirectional agent ↔ frontend channel.
//!
//! Only the event kinds this agent emits are modelled. Names and shapes follow
//! the AG-UI protocol's `type` discriminator and camelCase fields so the
//! existing gen_ui_core adapters and the web client's AG-UI consumer read them
//! without translation.

use axum::response::sse::Event as SseEvent;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// `RunAgentInput` as the frontend or the host sends it. Anything the agent
/// needs beyond the standard fields travels in `forwardedProps`; identity,
/// actor and signature fields are refused there (see `contract`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAgentInput {
    pub thread_id: String,
    pub run_id: String,
    #[serde(default)]
    pub state: Value,
    #[serde(default)]
    pub messages: Vec<Value>,
    #[serde(default)]
    pub tools: Vec<Value>,
    #[serde(default)]
    pub context: Vec<Value>,
    #[serde(default)]
    pub forwarded_props: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AgUiEvent {
    #[serde(rename_all = "camelCase")]
    RunStarted { thread_id: String, run_id: String },
    #[serde(rename_all = "camelCase")]
    RunFinished { thread_id: String, run_id: String },
    #[serde(rename_all = "camelCase")]
    RunError { message: String, code: String },
    #[serde(rename_all = "camelCase")]
    StepStarted { step_name: String },
    #[serde(rename_all = "camelCase")]
    StepFinished { step_name: String },
    #[serde(rename_all = "camelCase")]
    TextMessageStart { message_id: String, role: String },
    #[serde(rename_all = "camelCase")]
    TextMessageContent { message_id: String, delta: String },
    #[serde(rename_all = "camelCase")]
    TextMessageEnd { message_id: String },
    #[serde(rename_all = "camelCase")]
    StateSnapshot { snapshot: Value },
    #[serde(rename_all = "camelCase")]
    Custom { name: String, value: Value },
}

impl AgUiEvent {
    /// Encode as one SSE frame. The event name mirrors the `type` field so a
    /// consumer can subscribe by name or parse the JSON body.
    pub fn to_sse(&self) -> SseEvent {
        let name = match self {
            AgUiEvent::RunStarted { .. } => "RUN_STARTED",
            AgUiEvent::RunFinished { .. } => "RUN_FINISHED",
            AgUiEvent::RunError { .. } => "RUN_ERROR",
            AgUiEvent::StepStarted { .. } => "STEP_STARTED",
            AgUiEvent::StepFinished { .. } => "STEP_FINISHED",
            AgUiEvent::TextMessageStart { .. } => "TEXT_MESSAGE_START",
            AgUiEvent::TextMessageContent { .. } => "TEXT_MESSAGE_CONTENT",
            AgUiEvent::TextMessageEnd { .. } => "TEXT_MESSAGE_END",
            AgUiEvent::StateSnapshot { .. } => "STATE_SNAPSHOT",
            AgUiEvent::Custom { .. } => "CUSTOM",
        };
        SseEvent::default()
            .event(name)
            .json_data(self)
            .expect("AG-UI events are plain serializable data")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn events_serialize_with_the_protocol_discriminator_and_camel_case_fields() {
        let e = AgUiEvent::RunStarted {
            thread_id: "t".into(),
            run_id: "r".into(),
        };
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            serde_json::json!({"type": "RUN_STARTED", "threadId": "t", "runId": "r"})
        );
        let e = AgUiEvent::Custom {
            name: "a2ui.surface".into(),
            value: serde_json::json!({"x": 1}),
        };
        assert_eq!(serde_json::to_value(&e).unwrap()["type"], "CUSTOM");
    }

    #[test]
    fn run_input_accepts_the_standard_fields_and_defaults_the_rest() {
        let input: RunAgentInput =
            serde_json::from_value(serde_json::json!({"threadId": "t", "runId": "r"})).unwrap();
        assert_eq!(input.thread_id, "t");
        assert!(input.messages.is_empty());
        assert!(input.forwarded_props.is_null());
    }
}

/// Stream only persisted, caller-authorized host events. Dropping this stream
/// stops polling but does not cancel the durable task.
pub async fn run(
    axum::extract::State(state): axum::extract::State<crate::routes::AgentState>,
    headers: axum::http::HeaderMap,
    axum::Json(input): axum::Json<RunAgentInput>,
) -> axum::response::Response {
    use crate::task_host::{CallerHeaders, TaskInput};
    use axum::response::IntoResponse;
    let caller = match CallerHeaders::from_request(&headers) {
        Ok(caller) => caller,
        Err(error) => return error.into_response(),
    };
    let task_input = input
        .forwarded_props
        .as_object()
        .filter(|props| props.len() == 1)
        .and_then(|props| props.get("task"))
        .and_then(|value| serde_json::from_value::<TaskInput>(value.clone()).ok());
    let Some(task_input) = task_input else {
        return (
            axum::http::StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({"code":"invalid_task_input"})),
        )
            .into_response();
    };
    let (reference, task) = match state.task_host.resolve(&caller, task_input).await {
        Ok(result) => result,
        Err(error) => return error.into_response(),
    };
    let mut after = match headers.get("last-event-id") {
        None => 0,
        Some(value) => match value
            .to_str()
            .ok()
            .and_then(|value| value.rsplit_once(':'))
            .and_then(|(id, sequence)| {
                (id == reference.task_id.to_string())
                    .then(|| sequence.parse::<i64>().ok())
                    .flatten()
            }) {
            Some(sequence) if sequence >= 0 && sequence <= task.last_sequence => sequence,
            _ => return axum::http::StatusCode::BAD_REQUEST.into_response(),
        },
    };
    let (sender, receiver) = tokio::sync::mpsc::channel(16);
    tokio::spawn(async move {
        loop {
            let events = tokio::select! { _=sender.closed()=>return, events=state.task_host.events(&caller,&reference,after)=>events };
            let events = match events {
                Ok(events) => events,
                Err(error) => {
                    let _=sender.send(Ok::<_,std::convert::Infallible>(AgUiEvent::RunError{message:"Document task stream is unavailable. Reconnect with the same task.".into(),code:error.code.into()}.to_sse())).await;
                    return;
                }
            };
            for event in events {
                if event.task_id != reference.task_id || event.sequence <= after {
                    continue;
                }
                let terminal = matches!(event.event_type.as_str(), "RUN_FINISHED" | "RUN_ERROR");
                let Some(mut payload) = event.payload.as_object().cloned() else {
                    return;
                };
                // The type is host-controlled and restricted to the documented AG-UI vocabulary.
                if !matches!(
                    event.event_type.as_str(),
                    "RUN_STARTED"
                        | "RUN_FINISHED"
                        | "RUN_ERROR"
                        | "STEP_STARTED"
                        | "STEP_FINISHED"
                        | "TEXT_MESSAGE_START"
                        | "TEXT_MESSAGE_CONTENT"
                        | "TEXT_MESSAGE_END"
                        | "STATE_SNAPSHOT"
                        | "CUSTOM"
                ) {
                    return;
                }
                payload.insert("type".into(), serde_json::json!(event.event_type));
                let sse = axum::response::sse::Event::default()
                    .event(event.event_type)
                    .id(format!("{}:{}", event.task_id, event.sequence))
                    .json_data(payload)
                    .expect("JSON event");
                if sender.send(Ok(sse)).await.is_err() {
                    return;
                }
                after = event.sequence;
                if terminal {
                    return;
                }
            }
            let task = tokio::select! {_=sender.closed()=>return,task=state.task_host.get(&caller,&reference)=>task};
            match task {
                Ok(task) if (task.terminal() || task.paused()) && after >= task.last_sequence => {
                    return;
                }
                Err(_) => return,
                _ => {}
            }
            tokio::select! {_=sender.closed()=>return,_=tokio::time::sleep(std::time::Duration::from_millis(250))=>{}}
        }
    });
    axum::response::Sse::new(tokio_stream::wrappers::ReceiverStream::new(receiver))
        .keep_alive(axum::response::sse::KeepAlive::default())
        .into_response()
}

pub async fn cancel(
    axum::extract::State(state): axum::extract::State<crate::routes::AgentState>,
    headers: axum::http::HeaderMap,
    axum::Json(reference): axum::Json<crate::task_host::TaskReference>,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let caller = match crate::task_host::CallerHeaders::from_request(&headers) {
        Ok(caller) => caller,
        Err(error) => return error.into_response(),
    };
    match state.task_host.cancel(&caller, &reference).await {
        Ok(task) => axum::Json(task).into_response(),
        Err(error) => error.into_response(),
    }
}
