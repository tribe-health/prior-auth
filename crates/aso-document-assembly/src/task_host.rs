//! Caller-authenticated transport to the trusted host. No authority comes from a task id.
use axum::http::{HeaderMap, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;
use uuid::Uuid;

#[derive(Clone)]
pub struct TaskHost {
    base: reqwest::Url,
    client: reqwest::Client,
}

#[derive(Clone)]
pub struct CallerHeaders(HeaderMap);
impl CallerHeaders {
    pub fn from_request(headers: &HeaderMap) -> Result<Self, HostError> {
        let unauthenticated = || HostError {
            status: StatusCode::UNAUTHORIZED,
            code: "authentication_required",
        };
        let mut forwarded = HeaderMap::new();
        let mut credential_count = 0;
        for name in ["cookie", "x-session-token", "authorization"] {
            let all = headers.get_all(name);
            if all.iter().count() > 1 {
                return Err(unauthenticated());
            }
            if let Some(value) = all.iter().next() {
                let text = value.to_str().map_err(|_| unauthenticated())?;
                if text.trim().is_empty() {
                    return Err(unauthenticated());
                }
                if name == "authorization"
                    && !text.split_once(' ').is_some_and(|(scheme, token)| {
                        scheme.eq_ignore_ascii_case("bearer")
                            && !token.is_empty()
                            && !token.bytes().any(|byte| byte.is_ascii_whitespace())
                    })
                {
                    return Err(unauthenticated());
                }
                if name == "cookie"
                    && text
                        .split(';')
                        .filter(|pair| {
                            pair.trim()
                                .split_once('=')
                                .is_some_and(|(key, _)| key.trim() == "ory_kratos_session")
                        })
                        .count()
                        > 1
                {
                    return Err(unauthenticated());
                }
                credential_count += 1;
                let mut value = value.clone();
                value.set_sensitive(true);
                forwarded.insert(name, value);
            }
        }
        if credential_count != 1 {
            return Err(unauthenticated());
        }
        if let Some(origin) = headers.get("origin") {
            forwarded.insert("origin", origin.clone());
        }
        Ok(Self(forwarded))
    }
}

#[derive(Debug)]
pub struct HostError {
    pub status: StatusCode,
    pub code: &'static str,
}
impl axum::response::IntoResponse for HostError {
    fn into_response(self) -> axum::response::Response {
        (
            self.status,
            axum::Json(
                json!({"code":self.code,"error":"Document task request could not be completed."}),
            ),
        )
            .into_response()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExpectedRevisions {
    pub resolution_revision: String,
    pub criteria_selection_revision: String,
    pub evidence_revision: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Purpose {
    PriorAuthorizationRequest,
    CorrectedResubmission,
    ClinicalAppeal,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateCommand {
    pub command_id: Uuid,
    pub expected_revisions: ExpectedRevisions,
    pub purpose: Purpose,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StartTask {
    pub practice_id: Uuid,
    pub case_id: Uuid,
    pub command: GenerateCommand,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskReference {
    pub practice_id: Uuid,
    pub task_id: Uuid,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum TaskInput {
    Start(StartTask),
    Existing(TaskReference),
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTask {
    pub id: Uuid,
    pub case_id: Uuid,
    pub command_id: Uuid,
    pub purpose: Purpose,
    pub state: String,
    pub stage: String,
    pub created_at: String,
    pub updated_at: String,
    pub letter_id: Option<Uuid>,
    pub error_code: Option<String>,
    pub last_sequence: i64,
}
impl DocumentTask {
    pub fn terminal(&self) -> bool {
        matches!(
            self.state.as_str(),
            "completed" | "canceled" | "failed" | "rejected"
        )
    }
    pub fn paused(&self) -> bool {
        matches!(self.state.as_str(), "input-required" | "auth-required")
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentTaskEvent {
    pub task_id: Uuid,
    pub sequence: i64,
    pub occurred_at: String,
    pub event_type: String,
    pub payload: Value,
}
impl TaskHost {
    pub fn new(base: &str) -> Result<Self, &'static str> {
        let base = reqwest::Url::parse(base).map_err(|_| "invalid task host URL")?;
        if !matches!(base.scheme(), "http" | "https")
            || base.host_str().is_none()
            || !base.username().is_empty()
            || base.password().is_some()
            || base.query().is_some()
            || base.fragment().is_some()
        {
            return Err("invalid task host URL");
        }
        let client = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| "task host client unavailable")?;
        Ok(Self { base, client })
    }
    async fn request<T: serde::de::DeserializeOwned>(
        &self,
        caller: &CallerHeaders,
        method: reqwest::Method,
        path: &str,
        practice: Uuid,
        after: Option<i64>,
        body: Option<&GenerateCommand>,
    ) -> Result<T, HostError> {
        let mut url = self.base.join(path).map_err(|_| HostError {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: "host_configuration",
        })?;
        url.query_pairs_mut()
            .append_pair("practiceId", &practice.to_string());
        if let Some(after) = after {
            url.query_pairs_mut()
                .append_pair("afterSequence", &after.to_string());
        }
        let mut request = self.client.request(method, url).headers(caller.0.clone());
        if let Some(body) = body {
            request = request.json(body);
        }
        let mut response = request.send().await.map_err(|_| HostError {
            status: StatusCode::BAD_GATEWAY,
            code: "task_host_unavailable",
        })?;
        if !response.status().is_success() {
            let status = match response.status().as_u16() {
                401 => StatusCode::UNAUTHORIZED,
                403 => StatusCode::FORBIDDEN,
                404 => StatusCode::NOT_FOUND,
                409 => StatusCode::CONFLICT,
                422 => StatusCode::UNPROCESSABLE_ENTITY,
                _ => StatusCode::BAD_GATEWAY,
            };
            return Err(HostError {
                status,
                code: "task_host_refused",
            });
        }
        // Trusted host artifacts remain bounded; never emit its diagnostic response body.
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| HostError {
            status: StatusCode::BAD_GATEWAY,
            code: "task_host_unavailable",
        })? {
            if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                return Err(HostError {
                    status: StatusCode::BAD_GATEWAY,
                    code: "task_host_response_limit",
                });
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes).map_err(|_| HostError {
            status: StatusCode::BAD_GATEWAY,
            code: "task_host_invalid_response",
        })
    }
    pub async fn start(
        &self,
        caller: &CallerHeaders,
        input: &StartTask,
    ) -> Result<DocumentTask, HostError> {
        self.request(
            caller,
            reqwest::Method::POST,
            &format!("/api/cases/{}/document-tasks", input.case_id),
            input.practice_id,
            None,
            Some(&input.command),
        )
        .await
    }
    pub async fn get(
        &self,
        caller: &CallerHeaders,
        reference: &TaskReference,
    ) -> Result<DocumentTask, HostError> {
        self.request(
            caller,
            reqwest::Method::GET,
            &format!("/api/document-tasks/{}", reference.task_id),
            reference.practice_id,
            None,
            None,
        )
        .await
    }
    pub async fn cancel(
        &self,
        caller: &CallerHeaders,
        reference: &TaskReference,
    ) -> Result<DocumentTask, HostError> {
        self.request(
            caller,
            reqwest::Method::POST,
            &format!("/api/document-tasks/{}/cancel", reference.task_id),
            reference.practice_id,
            None,
            None,
        )
        .await
    }
    pub async fn resume(
        &self,
        caller: &CallerHeaders,
        reference: &TaskReference,
    ) -> Result<DocumentTask, HostError> {
        self.request(
            caller,
            reqwest::Method::POST,
            &format!("/api/document-tasks/{}/resume", reference.task_id),
            reference.practice_id,
            None,
            None,
        )
        .await
    }
    pub async fn events(
        &self,
        caller: &CallerHeaders,
        reference: &TaskReference,
        after: i64,
    ) -> Result<Vec<DocumentTaskEvent>, HostError> {
        self.request(
            caller,
            reqwest::Method::GET,
            &format!("/api/document-tasks/{}/events", reference.task_id),
            reference.practice_id,
            Some(after),
            None,
        )
        .await
    }
    pub async fn artifacts(
        &self,
        caller: &CallerHeaders,
        reference: &TaskReference,
    ) -> Result<Value, HostError> {
        self.request(
            caller,
            reqwest::Method::GET,
            &format!("/api/document-tasks/{}/artifacts", reference.task_id),
            reference.practice_id,
            None,
            None,
        )
        .await
    }
    pub async fn resolve(
        &self,
        caller: &CallerHeaders,
        input: TaskInput,
    ) -> Result<(TaskReference, DocumentTask), HostError> {
        match input {
            TaskInput::Start(start) => {
                let task = self.start(caller, &start).await?;
                Ok((
                    TaskReference {
                        practice_id: start.practice_id,
                        task_id: task.id,
                    },
                    task,
                ))
            }
            TaskInput::Existing(reference) => {
                let task = self.get(caller, &reference).await?;
                Ok((reference, task))
            }
        }
    }
}
