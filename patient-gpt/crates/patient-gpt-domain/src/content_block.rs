// TJ-ARCH-MOB-001 compliant
//! The 11-variant ContentBlock contract. TS and Dart mirror it as sealed
//! unions and switch exhaustively; a missing case is a compile error.

use serde::{Deserialize, Serialize};

use crate::clinical::Citation;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ToolStatus {
    Pending,
    Running,
    Complete,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ContentBlock {
    Text {
        text: String,
        is_streaming: bool,
    },
    Thinking {
        text: String,
        is_streaming: bool,
    },
    Code {
        language: String,
        code: String,
        filename: Option<String>,
    },
    /// Text plus the sources it rests on. An assertion with no source is not
    /// rendered as a citation block.
    Citation {
        text: String,
        sources: Vec<Citation>,
    },
    Memory {
        memory_type: String,
        key: String,
        value: String,
    },
    ToolUse {
        tool_use_id: String,
        tool_name: String,
        input: serde_json::Value,
        status: ToolStatus,
    },
    ToolResult {
        tool_use_id: String,
        output: String,
        is_error: bool,
    },
    Skill {
        skill_name: String,
        status: ToolStatus,
        output_summary: Option<String>,
    },
    Artifact {
        artifact_id: String,
        kind: String,
        title: String,
    },
    Image {
        url: String,
        alt: String,
        width: u32,
        height: u32,
    },
    Divider,
}
