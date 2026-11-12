# ADR 0009: Testing

## Status

Accepted

## Context

The maintainer wants a few fast tests that prove the working scenarios, not exhaustive coverage.

## Decision

- Vitest with jsdom and Testing Library. Tests live in `<package>/test/`.
- Per section: one to three integration tests of the main scenario, rendering the app (or the section) with a fresh fake IndexedDB and a stubbed AI client.
- `packages/core` gets tests only for logic that the scenarios do not reach easily.
- Each test finishes well under 10 seconds; no network, no real model calls, no wall-clock dependence.
- Demo data doubles as test fixtures.

## Consequences

- Edge cases without a scenario stay untested on purpose.
