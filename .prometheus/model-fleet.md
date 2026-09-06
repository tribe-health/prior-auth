# Model fleet

Profile in AGENTS.md: `mixed` (set `2026-09-04`)

AGENTS.md is per repository, not per model. Every model listed below reads the
same file, so the weakest one governs its content. Record the fleet here — a
profile choice nobody wrote down gets re-argued every time someone new arrives.

## Why `mixed` for this repo

This repository is wired for four harnesses simultaneously — `.claude/`,
`.opencode/`, `.kimi-code/`, and `.agents/` each carry the same OpenSpec skill
set. That is the definition of a mixed fleet, and it settles the profile
question before any measurement: the scaffold ships.

The domain raises the cost of the failure mode the scaffold prevents. A
fabricated identifier in an ordinary codebase is a compile error. Here, the
plausible-but-wrong output lands in a payer submission that carries a source
citation as a False Claims Act control. `mixed` costs a frontier model some
tokens on every turn; that is the cheaper side of the trade.

## Models that work this repo

| Model | Harness | Scaffold needed | Measured |
|---|---|---|---|
| Claude Opus 5 | Claude Code | no (supplies it) | no |
| unspecified | OpenCode | assumed yes | no |
| Kimi | Kimi Code | assumed yes | no |
| unspecified | `.agents/` | assumed yes | no |

Nothing above is measured. "Assumed yes" is the safe default, not a finding —
replace each row with a measured result before citing it as one.

## Before switching to lean

Do not adopt `lean` because a model is reported to be capable. Adopt it when
this repo's task set says so.

1. Fix ~10 representative tasks for this repo.
2. Run them under `mixed`, per model. Record pass rate and token cost.
3. Run them under `lean`, per model. Record the same.
4. Adopt `lean` only if no model regressed.

Pass rate is the gate. Token cost is the tiebreaker. A configuration that costs
less and passes less is a regression carrying an efficiency argument.

Candidate tasks for that set, drawn from this repo's actual failure surface:

- Add a payer criterion and render it across all three evidence states.
- Add a route to `aso-server-axum` and its 1:1 Tauri command counterpart.
- Change a colour role in `tokens.toml` and regenerate both themes.
- Add a Dart enum member whose unknown-value parse must throw, not default.
- Introduce a dependency and pin it exactly against the published version.

Tasks 1, 4 and 5 are the ones where a smaller model fails silently — the state
collapses to two, the parse defaults, or the pin resolves to a version that was
never published.

## Results

<!-- date | model | profile | pass rate | tokens | decision -->
