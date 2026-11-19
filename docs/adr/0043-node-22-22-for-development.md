# ADR 0043: Node 22.22 for Development

## Status

Accepted. Amends ADR 0002 (runtime minimum) for development only.

## Context

ADR 0002 set Node.js >= 22.12. The test environment now needs more: jsdom 31 requires Node ^22.22.2 (or ^24.15 / >= 26), and its undici dependency loads zlib's zstd decompressor, which Node 22.12 lacks, so every Vitest worker fails to start there. CI on 22.12 failed for this reason.

## Decision

- Developing voyput (install, check, build, tests) needs Node.js >= 22.22.2: the root `package.json` `engines` and the README say so, and CI runs the latest Node 22.
- voyput-local, which users run, keeps its own minimum of Node 22.12: it uses only Node built-ins (ADR 0026).

## Consequences

- Contributors on an older Node 22 get an engines warning from npm instead of a failing test run.
- CI follows Node 22 patch releases; a breaking patch would show up there first.
