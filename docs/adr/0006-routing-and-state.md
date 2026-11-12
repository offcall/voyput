# ADR 0006: Routing and State

## Status

Accepted

## Context

Sections (Import, Extract, Review, Trips, Visualize, Settings) are reachable at any time. Data is shared through the database, not passed between pages.

## Decision

- TanStack Router with code-based routes in `apps/web/src/app/router.tsx`. One route per section.
- Shared state through React context: `DbProvider` (database) and `SettingsProvider` (settings). Section state stays in its section.
- No global state library.

## Consequences

- Routes are typed; a broken link fails `tsc`.
- Tests render the whole app with a memory history.
