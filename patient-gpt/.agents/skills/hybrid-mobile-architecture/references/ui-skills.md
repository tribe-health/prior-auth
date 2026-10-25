# UI/UX Skills Reference
> TJ-ARCH-MOB-001 · The UI/UX skill stack that turns generic AI output into intentional
> design. Read before any frontend work on either surface. Project-local skill templates
> live in `templates/project-skills/` and are emitted into every scaffolded project's
> `.claude/skills/` by `scripts/add-project-skills.mjs`.

UI/UX skills are **mandatory, not optional** (CLAUDE.md, Development Philosophy). They are
the difference between stock-template output and design that looks like a real product.
Invoke them BEFORE writing UI code, not after — first-shot quality is the discipline.

## Two layers

1. **External skills** — installed in the environment / skill pack; broad capability.
2. **Project-local skills** — five templates authored in this repo, emitted into each
   scaffolded project so they travel with the code and activate on prompt-word match.

---

## External skills (install / reference)

| Skill / server | Surface | Why | Source |
|---|---|---|---|
| `frontend-design` | React/web | Biggest first-shot design lift | Anthropic (anthropic-skills) |
| shadcn MCP + shadcn/ui skill | React/web | Correct component sourcing & APIs | already connected |
| `theme-factory` | both | One token source → Tailwind AND Flutter themes | Anthropic |
| `react-best-practices` | React | React 19 idioms | vercel-labs/agent-skills |
| `web-design-guidelines` | web | Design-quality guardrails | vercel-labs/agent-skills |
| `ui-ux-pro-max` | React + Flutter | Only high-adoption skill covering both | nextlevelbuilder |
| Dart & Flutter MCP | Flutter | Hot-reload / widget-inspector verify loop | already connected |
| flutter/skills | Flutter | Responsive layout, layout-fix, go_router | flutter (official) |
| VGV golden-test workflow | Flutter | Visual regression via goldens | vgv-ai-flutter-plugin |
| `shadcn-ui-flutter` | Flutter | Correct shadcn_flutter APIs | nank1ro |
| accessibility-agents / claude-a11y-skill | both | WCAG 2.2 AA depth | Community-Access / airowe |

**Priority for a first-shot design:** `theme-factory` (tokens) → `frontend-design` /
`ui-ux-pro-max` (composition) → shadcn (components) → `web-design-guidelines` (guardrails) →
a11y skills (gate). On Flutter: `theme-factory` → flutter/skills + `shadcn-ui-flutter` →
Dart & Flutter MCP (verify) → VGV goldens → a11y.

---

## Project-local skills (emitted into scaffolds)

Five templates in `templates/project-skills/`, copied into `<project>/.claude/skills/` with
directive descriptions (`ALWAYS invoke when…`), folder name == frontmatter `name`, and a
`UserPromptSubmit` activation hook that matches trigger words.

| Skill | When it fires | Backing |
|---|---|---|
| `content-block-ui` | Rendering/adding any ContentBlock variant (11-variant contract, exhaustiveness) | `references/rust/new-block-type.md` |
| `hybrid-design-tokens` | Any color/spacing/type/theme value; keeps Tailwind + Flutter themes in sync | `theme-factory` |
| `tauri-ui-review` | After a React/Tauri surface change — screenshot loop at 320/768/1024/1440 × both themes | BrowserClaw/Playwright |
| `flutter-golden-ui` | After a Flutter widget change — golden scaffolding + dart-mcp hot-reload verify | VGV, Dart & Flutter MCP |
| `a11y-gate` | Any UI edit — cross-surface WCAG 2.2 AA checklist, backed by a PostToolUse reminder hook | axe / Flutter Semantics |

The skills cross-link with `[[name]]` references so activating one surfaces the others.

### Activation mechanics

- **Directive descriptions** — every template description starts with `ALWAYS invoke when…`
  and lists trigger words, per the skill-authoring convention.
- **Name == folder** — the frontmatter `name` matches the directory name (required).
- **`UserPromptSubmit` hook** (`.claude/hooks/skill-activation.mjs`) — matches prompt words
  to skills and appends a directive reminder via `additionalContext`. Additive, never
  blocks. Raises activation from ~50% to ~84–100% (assessment §3.4, cited studies).
- **`PostToolUse` hook** (`.claude/hooks/a11y-reminder.mjs`) — after a UI file edit, reminds
  to run `a11y-gate`. Advisory (non-blocking); it does not judge the code.

Both hooks are wired by `templates/project-skills/settings.hooks.json`, merged into the
scaffolded project's `.claude/settings.json` by the emitter script.

---

## Emitting into a project

`scripts/scaffold-hybrid.mjs` (and the single-surface scaffolds) call
`scripts/add-project-skills.mjs <project-dir>`, which:

1. Copies the 5 skill directories into `<project>/.claude/skills/`.
2. Copies the two hook scripts into `<project>/.claude/hooks/` (executable).
3. Merges `settings.hooks.json` into `<project>/.claude/settings.json` (creates it if
   absent; if `jq` is available it deep-merges, otherwise it writes the hooks file and
   notes any existing settings to merge by hand).

The step is additive and backward-compatible — existing scaffold behavior is unchanged for
projects that don't opt in.
