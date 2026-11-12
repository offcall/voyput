# ADR 0004: Workspace Layout

## Status

Accepted

## Context

The app needs shared UI components and logic that tests can reach without a browser, and several agents work on it in parallel.

## Decision

npm workspaces:

- `apps/web`: the app. Routes, pages, Dexie database, AI client. One folder per section in `src/features/<section>`.
- `packages/ui` (`@voyput/ui`): shared components on Base UI, theme CSS, Storybook.
- `packages/core` (`@voyput/core`): domain types and pure logic (CSV, stamps, trips, visualization data). No React, no IndexedDB, no network.

Packages export their TypeScript sources directly; Vite and Vitest compile them. One root `tsconfig.json` type-checks everything with `moduleResolution: "Bundler"` and `jsx: "react-jsx"`, which supersedes the `NodeNext` line of ADR 0002.

## Consequences

- No package build step.
- Logic placed in `core` is testable in isolation; side effects stay in `apps/web`.
