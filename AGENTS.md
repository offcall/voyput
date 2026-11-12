# AGENTS.md

Instructions for coding agents in this repo.

## Project

voyput reconstructs a travel history from passport stamp photos, cross-checked against Apple Photos GPS data, in a browser UI you can edit and review.

TypeScript. Toolchain (runtime, package manager, test runner, type check) recorded in `docs/adr/`. One task at a time.

## Language

All artifacts English: code, identifiers, comments, docs, ADRs, commits, tests, agent instructions.

## Communication

- Answer question asked. *Why*/*cause*: answer from code, logs, existing output. No commands, tests, reviews without user approval.
- Hypothesis: mark as hypothesis, state what confirms it. Never present guess as cause.
- Multi-step change: send short plan + task list first. Wait for approval.
- "Stop" or "change nothing" holds until user lifts it.

## Code Quality

Readable, modular, easy to change, split by responsibility. No needless abstraction.

- Strict TypeScript. No `any`; use `unknown` + narrowing.
- Validate data at boundaries: user input, files, network, agent output.
- Side effects (filesystem, git, processes, network) behind small replaceable interfaces. Core logic testable without them.

## Minimal Changes

Smallest correct change. Never:

- refactor, rename, reformat unrelated code;
- change public APIs without need;
- add dependencies without clear reason;
- change unrelated behavior.

Keep existing architecture unless ADR documents reason to change.

New generated, local, or secret files (dependencies, build/test output, caches, env files): update `.gitignore` in same commit.

## ADR Rules

Before significant architectural decision:

1. Read ADRs in `docs/adr/`.
2. Check decision already documented.
3. New decision: write ADR before or with implementation. Add row to `docs/adr/README.md`.
4. Never rewrite accepted ADR decision. Supersede with new ADR, mark old one superseded.

Significant: dependencies, toolchain, module boundaries, public interfaces, data formats, persistence, workflow.

Format:

- File: `docs/adr/NNNN-kebab-case-title.md`, sequential numbers.
- Title: `# ADR NNNN: Title`.
- Sections: `## Status`, `## Context`, `## Decision`, optional `## Alternatives`, `## Consequences`.
- Short. One decision per ADR.

`docs/adr/` = persistent architectural memory.

## Testing

- Behavior change ships with tests in same commit.
- Tests deterministic: no real network, no real model calls, no wall-clock or machine-specific paths.
- Tests hitting real external services: opt-in, outside default test command, run only with explicit user approval.

## Workflow

`inspect → plan → implement → validate → commit → report`

Before every commit: type check + tests pass.

Docs, ADR index rows, README updates go in same commit as behavior they describe. Check `README.md`, `docs/`, `docs/adr/README.md` for stale text before commit.

One commit = one understandable unit. Conventional Commit: `<type>(<scope>): <short description>`, lowercase, type one of `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

`AGENTS.md` changes: own `docs(agents): ...` commit, never with `.gitignore`, code, or other changes.

No push without user approval.

## Environment

- Parallel agents in one checkout: disjoint file sets. Coordinating agent owns shared files: `README.md`, `docs/adr/README.md`, `AGENTS.md`.
