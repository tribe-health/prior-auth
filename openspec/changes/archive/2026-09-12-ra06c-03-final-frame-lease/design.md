## Context

The current FRF use case authorizes and buffers a complete `Vec<u8>`, then the gateway creates the
HTTP response after the timeout has ended.

## Decisions

- Replace the buffered response boundary with a shell-neutral body stream and lease owner. Axum
  types remain in the gateway.
- Revalidate the ASO grant no less often than every 750 ms, bound the authority call to 750 ms and
  propagate cancellation within 250 ms.
- Keep a background monotonic cancellation owner alive through body completion/drop so upstream
  stall or client backpressure does not extend the lease.
- Give the response stream the same monotonic deadline and check it before and after receiver
  polling, so scheduler order cannot release a queued frame while the background owner is waking.
- Have the trusted shell sample monotonic time before sub-second Unix time and pass the pair. Treat
  the integer JWT `exp` as its exact Unix-second boundary; derive the monotonic grant deadline from
  the earlier monotonic sample so dispatch delay cannot extend the grant.
- Keep exact-session Kratos observation in Gate. When Gate observes direct Kratos revocation it
  closes the FRF response consumer; this change proves FRF producer, frame and continuation cleanup
  from that boundary. RA06c-04 owns the live assembled observation-to-closure proof.
- Release no body frame or continuation handle after cancellation. Preserve Electric status,
  headers, ordering and continuation behavior during normal completion.

## Measurement boundary

The contract ends at the last frame the server body produces or the cancellation preventing its
next frame. Bytes already buffered by an operating system, proxy or network cannot be recalled and
are not described as server-controlled delivery.
