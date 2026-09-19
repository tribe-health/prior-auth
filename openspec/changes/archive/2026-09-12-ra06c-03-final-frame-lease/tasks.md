## 1. Streaming lease

- [x] 1.1 Verify the exact locked Axum body APIs and define the shell-neutral FRF stream/lease contract.
- [x] 1.2 Implement streamed Electric response frames, periodic grant revalidation and background monotonic cancellation through completion/drop.
- [x] 1.3 Preserve status, protocol headers, frame order and continuation cleanup for normal and cancelled responses.

## 2. Boundary proof

- [x] 2.1 Test nonempty multi-frame throttling interrupted by logout, membership change, expiry and Gate response-consumer closure after modeled direct Kratos revocation.
- [x] 2.2 Test upstream stall, client backpressure, authority timeout/unavailability, consumer drop and normal completion with observed frame/cancellation timestamps.

## 3. Completion evidence

- [x] 3.1 Run FRF T0/T1 locally; sabotage the final lease check and observe a late-frame test fail, restore it, then run artifact-refiner and isolated adversarial review.
