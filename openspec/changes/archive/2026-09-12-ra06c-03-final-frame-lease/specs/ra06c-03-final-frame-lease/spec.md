## Purpose

Define bounded authorization through the final protected body frame produced by FRF.

## ADDED Requirements

### Requirement: Every protected body frame holds current authority

FRF SHALL retain a cancellable authority lease until its protected response body completes or is
dropped, SHALL derive grant expiry from paired monotonic and precise Unix request time captured at
the trusted interface, and SHALL produce no frame at or after the monotonic deadline even when the
cancellation worker has not yet been scheduled.

#### Scenario: Authority change interrupts a nonempty response

- **WHEN** logout or membership change reaches the lease authority, grant expiry occurs, or Gate closes the FRF response consumer after observing direct Kratos revocation
- **THEN** FRF records final-frame or cancellation, releases continuation state, produces no later protected frame and denies a new request within 5,000 ms.

This child capability begins the direct-Kratos case at Gate's response-consumer closure. It does not
claim that FRF observes Kratos directly. RA06c-04 owns the mounted Kratos-to-Gate observation and
closure interval.

#### Scenario: Expiry falls inside the current Unix second

- **WHEN** a request starts during the final fractional second before its integer JWT expiry and dispatch to the use case is delayed
- **THEN** FRF ends the lease at that exact Unix-second boundary and a ready buffered frame cannot cross it.

### Requirement: Backpressure cannot extend the lease

FRF SHALL cancel through a background monotonic owner even when upstream or the client stops body
polling.

#### Scenario: Upstream stalls or the client applies backpressure

- **WHEN** the lease deadline or authority check fails while no body frame is being polled
- **THEN** the next poll terminates without protected data and no continuation handle survives.

### Requirement: Electric protocol behavior is preserved

The streamed adapter SHALL preserve allowed Electric status, headers, frame order and continuation
semantics for a normally authorized response.

#### Scenario: Authority remains valid through completion

- **WHEN** a normal multi-frame shape response completes
- **THEN** the client observes the same allowed Electric protocol behavior and the lease releases cleanly.
