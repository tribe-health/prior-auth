# Greenfield, brownfield and continuous evolution

Determine which of these three workflows the user needs before choosing
commands. Existing applications and previous Builder outputs are supported
inputs to assessment, not disposable directories to replace.

## Greenfield

Select explicit surfaces and a supported profile. Check host tools, native
dependencies, bridge versions and capabilities before writing. Reject invalid
options and unsupported combinations without silently changing the request.
Generate into a new destination and retain feature-based clean architecture
with shared Rust domain logic. A skeleton is acceptable only when requested.

Generation, successful builds and observed runtime behavior are separate
evidence. Complete FFI, Riverpod and model generation before Flutter analysis.
Demonstrate a feature through the UI, repository/domain and real persistence;
restart and read back the state. Manifests and contract tests alone do not prove
a runnable application. See the assessment for current profile gaps.

## Brownfield

1. Inventory real source roots, surfaces, entrypoints, build commands, locks,
   schema ownership and native bridges. Do not infer a surface from a profile.
2. Identify the requested change and architecture gaps. Preserve working
   behavior and report incompatible layouts; map nonstandard source roots.
3. Preview `knowme-builder adopt <path> --profile <profile> --check`. Adoption
   owns newly created Builder control metadata, not pre-existing application code.
4. Apply within the requested scope. Integrate additions through the actual
   composition root, domain/repository boundaries and UI. Files under
   `.knowme-builder/additions` remain proposals until integrated and run.
5. Verify existing behavior and the new feature on every affected surface.

Never replace an existing application to make it resemble a template. The
current inventory recognizes canonical manifest locations; alternative layouts
need explicit mapping and manual integration until that support is implemented.

## Upgrade previous outputs

Read the recorded Builder version, original rendering inputs and ownership
lock. Preview `knowme-builder upgrade <path> --check` before `--apply`. Preserve
user edits and resolve conflicts explicitly; a failed operation must not advance
the applied version. A moved directory must not rename the application.

Managed-file upgrades write `.knowme-builder/upgrade-journal.json` before
changing application files. The journal contains original bytes, expected
output hashes and an operation ID. `knowme-builder upgrade <path> --rollback`
restores the latest operation, including metadata, and refuses the entire
rollback if any file has later user edits. Interrupted operations require
rollback before retrying. Native file locking coordinates Builder writers.

This journal covers existing managed files. It is not a semantic migration
engine for every historical version, a database backup, or a guarantee against
arbitrary external writers or power loss. New/removed/renamed files, dependencies,
bridge codegen and application schemas need explicit versioned migrations.
Unsupported histories receive a migration diagnostic, not a successful no-op.
Do not execute destructive application-data migrations without a reviewed plan
and backup. Verify idempotence, recovery and rebuild/run of migrated fixtures.

## Host evidence and portable tooling

Windows targets are `x86_64-pc-windows-msvc` and `aarch64-pc-windows-msvc`.
Installed Rust standard libraries do not supply MSVC, the Windows SDK or all
native dependencies. Build and run each claimed architecture on an appropriate
host; iOS needs Apple tooling. Prefer native Rust utilities for native work.

First-party hooks and orchestration use TypeScript 7 sources compiled to Node
`.mjs`. Genuine vendor SDK launchers/build internals are separately documented
dependencies. Full and mini distributions stage the same portable package bytes.
