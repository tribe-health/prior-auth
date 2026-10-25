# Model fleet

Profile in AGENTS.md: `mixed` (set `2026-10-04`)

AGENTS.md is per repository, not per model. Every model listed below reads the
same file, so the weakest one governs its content. Record the fleet here — a
profile choice nobody wrote down gets re-argued every time someone new arrives.

## Models that work this repo

| Model | Harness | Scaffold needed | Measured |
|---|---|---|---|
| | | | no |

## Before switching to lean

Do not adopt `lean` because a model is reported to be capable. Adopt it when
this repo's task set says so.

1. Fix ~10 representative tasks for this repo.
2. Run them under `mixed`, per model. Record pass rate and token cost.
3. Run them under `lean`, per model. Record the same.
4. Adopt `lean` only if no model regressed.

Pass rate is the gate. Token cost is the tiebreaker. A configuration that costs
less and passes less is a regression carrying an efficiency argument.

## Results

<!-- date | model | profile | pass rate | tokens | decision -->

## 2026-10-04 — Initial harness scope

OpenSpec is configured for Codex, OpenCode, Claude Code, Kimi Code, Zed,
MiniMax Code, and DeepSeek Harness. These are harness targets, not measured
model assignments. The project team and its models will be added later.
Retain `mixed` until measurements justify another profile; no model-comparison
or cross-harness runtime certification has been performed here.
