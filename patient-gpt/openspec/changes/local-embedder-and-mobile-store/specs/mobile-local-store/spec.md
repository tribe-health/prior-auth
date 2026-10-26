# Spec Delta

## Purpose

Gives the iOS and Android apps a durable on-device store so conversations and
onboarding settings survive a restart, with all records classified local.

## ADDED Requirements

### Requirement: Mobile conversations survive a restart
On iOS and Android, conversations created through the app SHALL be stored on the
device and SHALL be listed again after the app process is ended and restarted.

#### Scenario: Restart keeps the onboarding conversation
- **WHEN** a user creates an onboarding conversation, the app is force-quit and relaunched
- **THEN** listing conversations with scope `onboarding` returns that conversation with its title

### Requirement: Settings are stored on the device
The mobile store SHALL hold one settings record per device, readable after
restart, and every record in the store SHALL be classified `local`.

#### Scenario: Setting survives a restart
- **WHEN** a setting is written through a host setup command and the app is relaunched
- **THEN** reading settings returns the written value

### Requirement: A store that cannot open stops startup with a reason
If the mobile store cannot be opened, the app SHALL report a storage error with
code `storage_failed` and SHALL NOT fall back to an in-memory store.

#### Scenario: Store directory not writable
- **WHEN** the store directory passed at boot cannot be created
- **THEN** boot fails with `storage_failed` and the app shows that local storage could not be opened
