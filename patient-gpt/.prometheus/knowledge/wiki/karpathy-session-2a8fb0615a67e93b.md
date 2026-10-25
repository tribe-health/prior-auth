---
type: SessionRecord
id: karpathy-session-2a8fb0615a67e93b
title: Karpathy session 2a8fb0615a67
tags:
- karpathy
- session-learning
sources:
- resource: session:bb08a33e-9561-4503-a7b8-268d3122f1e8
generated:
  by: pk/1.11.0
  at: 2026-10-25T16:54:38.172221+00:00
created_at: 2026-10-25T16:54:38.172221+00:00
updated_at: 2026-10-25T16:54:38.172221+00:00
revision: 0
---

## Delta

The web app now works end to end against the live Rust server. I sent the "What's due this week?" chip: the deterministic reply streamed in, the conversation took its ID from the server, and it showed up under History.

Against the prototype at 1100px, the layout matches. These gaps remain:

- **Sidebar dates are clipped:** they show "Oct" and "Oct 1" where they should show the full dates. This is a defect.
- **Wrong patient opens first:** the prototype opens the first patient due (Delgado); the scaffold opens Brennan.
- **Long procedure names:** rows show the full procedure name, not the prototype's short form ("C5–C6 ACDF"). There's also no stage track or "Next:" line, because the contract doesn't include those fields yet.
- **Overdue dates:** the synthetic due dates are earlier this month and are counted from today's date, so they all read as overdue ("22 days ago"). The prototype pins "today" to 2026-10-02.

The Tauri desktop and Flutter Rust bridge agents are still running.

## Root Cause

No explicit root-cause section was captured; preserve this as a session record, not an inferred diagnosis.

## Corrective Actions

Review and promote only reusable findings.

## Session Metadata

- Harness: claude-code
- Session: bb08a33e-9561-4503-a7b8-268d3122f1e8
- Captured: 2026-10-25T16:54:19.772396Z
- Project: /Users/gqadonis/Projects/TribeHealth/kevin/prior-auth/patient-gpt

## Changed Paths

- No changed paths detected.
