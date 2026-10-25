# Generator placeholders

> Contract for porting code out of a real product codebase into this generator.
> Enforced by `node scripts/audit.mjs generator-purity`.

## Why this exists

This pack scaffolds applications for anyone. Anything product-specific that reaches
`scripts/` or `assets/templates/` is emitted into every generated project — another
company's product name in their source tree, another company's brand colour in their
theme, a spec reference to a document they cannot read.

The risk peaks exactly when the pack is most valuable: porting hard-won learnings out
of the reference product. In the KnowMe production tree, **46 of 133 Rust files mention
the product**. Ported verbatim, all of it ships.

The saving grace, verified across every affected file in `gen_ui_inference`, is that
the coupling is **naming-only** — env-var prefixes, log targets, and FFI/JNI symbol
names. There is no structural product logic to untangle. Substitution is sufficient.

## The placeholders

| Placeholder | Form | Example substitution | Used for |
|---|---|---|---|
| `__APP_NAME__` | `snake_case` | `my_app` | Dart package names, crate names, log targets |
| `__APP_CLASS__` | `PascalCase` | `MyApp` | Swift/Kotlin class names, FFI bridge types |
| `__APP_ID__` | reverse-DNS | `com.example.myapp` | Android `applicationId`, JNI class paths, Tauri identifier |
| `__ENV_PREFIX__` | `SCREAMING_SNAKE` | `MY_APP` | Environment-variable prefixes |

`scaffold-*.sh` derives all four from the single `<app-name>` argument. Never introduce
a fifth: each one is a value a user must understand and keep consistent.

## Worked substitutions

Every shape found in the production inference crate:

| Production | Templated |
|---|---|
| `KNOWME_LOCAL_MODEL_MAX_BYTES` | `__ENV_PREFIX___LOCAL_MODEL_MAX_BYTES` |
| `KNOWME_DEVICE_MEMORY_BUDGET_BYTES` | `__ENV_PREFIX___DEVICE_MEMORY_BUDGET_BYTES` |
| `target: "knowme_litert_lm"` | `target: "__APP_NAME___litert_lm"` |
| `target: "knowme_mlx"` | `target: "__APP_NAME___mlx"` |
| `KnowMeMlxBridge` | `__APP_CLASS__MlxBridge` |
| `KnowMeLiteRtLmBridge` | `__APP_CLASS__LiteRtLmBridge` |
| `knowme_mlx_register_bridge` | `__APP_NAME___mlx_register_bridge` |
| `com.example.myapp.MyAppLiteRtLmBridge` | `__APP_ID__.__APP_CLASS__LiteRtLmBridge` |

Note the doubled underscore in `__ENV_PREFIX___LOCAL_...` — the placeholder ends with
`__` and the separator adds one more. This is correct and intentional; do not "fix" it.

## Two mechanisms, one rule

Which one you use depends on the file, but the rule is the same: **no product value and
no version literal is ever inlined in an emitted file.**

- **`__NAME__`** — product identity, substituted from the app name at scaffold time.
  Used in files copied wholesale out of `assets/templates/`.
- **`@NAME@`** — version pins, substituted from `versions.toml` via
  `scripts/portable/versions.mjs`. Keep template text literal and apply explicit
  substitutions; never interpolate template contents through a shell.

`scaffold-rust-core.mjs` delegates to the native Builder. The structural
`verify-scaffold.mjs` gate scans emitted Rust/scripts for known placeholder
patterns and parses emitted TOML. This check is separate from build/run proof.

## Naming rule for design tokens

Name a token for the **role it plays**, never for the colour or brand it currently holds.
`--color-accent` survives a rebrand; `--color-ember` becomes a lie the first time the
brand changes, and renaming it then touches every call site.

## The allowlist

`scripts/audit.mjs` carries a short allowlist of paths exempt from the scan. It is
deliberately short, and every entry states its reason:

- `assets/templates/rust/vendor/` — third-party source vendored verbatim. Patching it to
  strip strings would defeat the point of pinning a known-good copy.
- `scripts/audit.mjs` — this file names the patterns it searches for.
- The three Python/mjs maintenance utilities — they operate on this repo's own wiki,
  worktrees, and editor config, and never emit a line of user code.

**Add to the allowlist only when a file genuinely cannot be templated.** Loosening a
pattern to make the gate pass is not a fix — it disables the check for every future port.

## References excluded on purpose

`references/` and `docs/` are **not** scanned. They are agent-facing prose where citing
the reference product as a worked case study is the whole point. The distinction that
matters is not "mentions the product" but "ships into a stranger's repository."
