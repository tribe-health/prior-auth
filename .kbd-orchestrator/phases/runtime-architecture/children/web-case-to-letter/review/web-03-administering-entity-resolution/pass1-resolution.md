# Web-03 adversarial review pass 1 resolution

## Finding 1 — unchecked task boxes

Disposition: sequencing false positive.

Task 2.1 is the active KBD task and cannot be marked complete until its adversarial review passes and the `kbd-apply` end-task hook runs. Task 3.1 is the next task and is outside this review boundary under the one-task-per-turn contract. The change will not be archived during task 2.1. Review this candidate for whether task 2.1's focused verification, sabotage/restore, artifact-refiner, and adversarial-review requirements are satisfied; do not require the future task 3.1 to be pre-completed.

## Finding 2 — incomplete recorded schema commands

Disposition: fixed.

`scripts/test-web03-resolution-schema.py` now records its required `--output` argument. Both retained task-2 receipts now state the exact runnable command and carry an explicit metadata-correction record explaining that the probe necessarily received the argument to write each receipt, while the old report formatter omitted it. The behavioral result and original receipt content remain preserved. Python compilation, strict OpenSpec validation, and all eleven artifact-refiner constraints pass after the repair.
