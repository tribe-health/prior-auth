// TJ-ARCH-MOB-001 compliant
//! Domain DTO → FFI type. Exhaustive matches, no defaults.

use patient_gpt_domain::{
    AguiEvent, CaseSummary, ConversationSummary, Health, MessageRole, PatientSummary,
    PrincipalKind, Role, Session,
};

use crate::api::patient_gpt::{
    FfiAguiEvent, FfiAguiEventKind, FfiCaseDue, FfiCaseSummary, FfiConversationSummary,
    FfiCriteriaTally, FfiHealth, FfiPatientSummary, FfiPrincipal, FfiPrincipalKind, FfiRole,
    FfiSession,
};

impl From<Health> for FfiHealth {
    fn from(h: Health) -> Self {
        Self {
            status: h.status,
            version: h.version,
        }
    }
}

impl From<Session> for FfiSession {
    fn from(s: Session) -> Self {
        let p = s.principal;
        Self {
            principal: FfiPrincipal {
                id: p.id,
                display_name: p.display_name,
                role: match p.role {
                    Role::Surgeon => FfiRole::Surgeon,
                    Role::Coordinator => FfiRole::Coordinator,
                    Role::Administrator => FfiRole::Administrator,
                },
                kind: match p.kind {
                    PrincipalKind::Human => FfiPrincipalKind::Human,
                    PrincipalKind::DelegatedAgent => FfiPrincipalKind::DelegatedAgent,
                },
            },
            practice: s.practice,
        }
    }
}

impl From<PatientSummary> for FfiPatientSummary {
    fn from(p: PatientSummary) -> Self {
        Self {
            id: p.id,
            display_name: p.display_name,
            payer: p.payer,
            case_ids: p.case_ids,
        }
    }
}

impl From<CaseSummary> for FfiCaseSummary {
    fn from(c: CaseSummary) -> Self {
        Self {
            id: c.id,
            patient_id: c.patient_id,
            procedure: c.procedure,
            payer: c.payer,
            closed: c.closed,
            due: c.due.map(|d| FfiCaseDue {
                kind: d.kind,
                date: d.date,
            }),
            tally: FfiCriteriaTally {
                met: c.tally.met,
                gap: c.tally.gap,
                void_count: c.tally.void,
            },
        }
    }
}

impl From<ConversationSummary> for FfiConversationSummary {
    fn from(c: ConversationSummary) -> Self {
        Self {
            id: c.id,
            scope: c.scope.to_string(),
            title: c.title,
            updated_at: c.updated_at,
        }
    }
}

fn event(kind: FfiAguiEventKind) -> FfiAguiEvent {
    FfiAguiEvent {
        kind,
        run_id: None,
        thread_id: None,
        message_id: None,
        role: None,
        delta: None,
        message: None,
        code: None,
    }
}

impl From<AguiEvent> for FfiAguiEvent {
    fn from(e: AguiEvent) -> Self {
        match e {
            AguiEvent::RunStarted { run_id, thread_id } => FfiAguiEvent {
                run_id: Some(run_id),
                thread_id: Some(thread_id),
                ..event(FfiAguiEventKind::RunStarted)
            },
            AguiEvent::TextMessageStart { message_id, role } => FfiAguiEvent {
                message_id: Some(message_id),
                role: Some(
                    match role {
                        MessageRole::Assistant => "assistant",
                    }
                    .to_owned(),
                ),
                ..event(FfiAguiEventKind::TextMessageStart)
            },
            AguiEvent::TextMessageContent { message_id, delta } => FfiAguiEvent {
                message_id: Some(message_id),
                delta: Some(delta),
                ..event(FfiAguiEventKind::TextMessageContent)
            },
            AguiEvent::TextMessageEnd { message_id } => FfiAguiEvent {
                message_id: Some(message_id),
                ..event(FfiAguiEventKind::TextMessageEnd)
            },
            AguiEvent::RunFinished { run_id, thread_id } => FfiAguiEvent {
                run_id: Some(run_id),
                thread_id: Some(thread_id),
                ..event(FfiAguiEventKind::RunFinished)
            },
            AguiEvent::RunError { message, code } => FfiAguiEvent {
                message: Some(message),
                code,
                ..event(FfiAguiEventKind::RunError)
            },
        }
    }
}
