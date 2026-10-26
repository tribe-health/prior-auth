# Proposal

## Why

Goal 1 needs a streamed local reply on iOS with UAR absent. MLX cannot run in the
iOS simulator (mlx-swift `running-on-ios.md`), so decision 1 records iOS chat
evidence from the "Mac (Designed for iPad)" destination plus a physical iPhone,
with no candle lane. D-001 picks MLX-Swift through `mlx-swift-lm`.

## What Changes

- A Swift engine in the iOS Runner using `mlx-swift` 0.32.3 and `mlx-swift-lm`
  3.32.3 (Swift Package Manager), exposed to Rust through a C function table that
  the Runner registers with `patient-gpt-ffi` at launch.
- A Rust `LocalChatPort` adapter in `patient-gpt-inference` (feature
  `engine-bridge`) that calls the registered table and streams tokens.
- Simulator builds compile the engine out and register nothing, so `local` runs
  on the simulator are refused with `engine_unavailable`, stating why.
- The FFI boot wires the adapter on iOS; Android is handled by `android-local-chat`.

## Capabilities

### New Capabilities
- `local-chat-ios`: the iOS engine's observable behaviour on Apple-silicon Macs (Designed for iPad) and iPhones, and its stated absence in the simulator.

### Modified Capabilities
- (none)

## Impact

- `mobile/ios/Runner/` (new Swift file, bridging header, Xcode project SPM
  package references), `crates/patient-gpt-ffi` (registration entry point),
  `crates/patient-gpt-inference` (bridge adapter).
- New Swift packages `mlx-swift` and `mlx-swift-lm` (MIT); pins listed for the
  operator. `project.pbxproj` edits must not disturb the icon pipeline lines
  `gen-app-icons.sh` snapshots.
- Prerequisites outside the repository: an Apple development team for signing on
  the Mac destination and the iPhone, and a physical iPhone.
