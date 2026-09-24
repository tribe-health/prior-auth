# syntax=docker/dockerfile:1.27
# Build context: the Liter-LLM checkout. Additional context `aso`: this repo.
FROM rust:1.98.1-bookworm AS builder
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates/ crates/
COPY packages/ packages/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/build/target \
    cargo build --locked --package liter-llm-cli && \
    cp target/debug/liter-llm /usr/local/bin/liter-llm

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && \
    rm -rf /var/lib/apt/lists/* && \
    useradd --system --uid 10001 --create-home liter
COPY --from=builder /usr/local/bin/liter-llm /usr/local/bin/liter-llm
COPY --from=aso docker/liter-llm/proxy.toml /etc/liter-llm/proxy.toml
COPY --from=aso docker/liter-llm/start.sh docker/liter-llm/probe.sh /etc/liter-llm/
USER 10001
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 CMD ["/bin/sh", "/etc/liter-llm/probe.sh"]
ENTRYPOINT ["/bin/sh", "/etc/liter-llm/start.sh"]
