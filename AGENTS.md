# AGENTS.md

Rules for contributors and coding agents.

## Project

voyput: travel history from passport stamp photos, cross-checked against Apple Photos GPS data, in browser UI you edit and review.

TypeScript. Toolchain (runtime, package manager, test runner, type check): `docs/adr/`. One task at a time.

## Layout

- `apps/web`: app. One folder per section in `src/features/<section>`; section owns its folder.
- `packages/ui`: shared components (Base UI) + `styles.css`. New component: own file, export from `src/index.ts`, add story.
- `packages/core`: domain types + pure logic, one folder per domain. No React, IndexedDB, network.
- DB schema: `apps/web/src/db/db.ts`. Change only by adding Dexie version.

## Language

All artifacts English: code, identifiers, comments, docs, ADRs, commits, tests.

## Communication

- Cause unknown: mark hypothesis as hypothesis, state what confirms it. Never present guess as cause.
- Multi-step change: short plan + task list first.

## Code Quality

Readable, modular, easy to change, split by responsibility. No needless abstraction.

- Strict TypeScript. No `any`; `unknown` + narrowing.
- Validate data at boundaries: user input, files, network, model output.
- Side effects (filesystem, git, processes, network) behind small replaceable interfaces. Core logic testable without them.

## Minimal Changes

Smallest correct change. Never:

- refactor, rename, reformat unrelated code;
- change public APIs without need;
- add dependencies without clear reason;
- change unrelated behavior.

Keep existing architecture unless ADR documents reason to change.

New generated, local, secret files (dependencies, build/test output, caches, env files): update `.gitignore` in same commit.

## ADRs

Before significant architectural decision:

1. Read `docs/adr/`.
2. Check decision already documented.
3. New decision: write ADR before or with implementation. Add row to `docs/adr/README.md`.
4. Never rewrite accepted ADR decision. Supersede with new ADR, mark old one superseded.

Significant: dependencies, toolchain, module boundaries, public interfaces, data formats, persistence, workflow.

Format:

- File: `docs/adr/NNNN-kebab-case-title.md`, sequential numbers.
- Title: `# ADR NNNN: Title`.
- Sections: `## Status`, `## Context`, `## Decision`, optional `## Alternatives`, `## Consequences`.
- Short. One decision per ADR.

## Testing

- Behavior change ships with tests in same commit.
- Tests deterministic: no real network, no real model calls, no wall-clock or machine-specific paths.
- Tests hitting real external services: opt-in, outside default test command.

## Workflow

`inspect → plan → implement → validate → commit`

Before every commit: `npm run check` passes (lint, type check, tests).

Docs, ADR index rows, README updates in same commit as behavior they describe. Check `README.md`, `docs/`, `docs/adr/README.md` for stale text before commit.

One commit = one understandable unit. Conventional Commit: `<type>(<scope>): <short description>`, lowercase, type one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

`AGENTS.md` changes: own `docs(agents): ...` commit, never with other changes.
