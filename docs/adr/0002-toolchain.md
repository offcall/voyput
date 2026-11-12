# ADR 0002: Toolchain

## Status

Proposed

## Context

voyput needs one recorded toolchain for runtime, package manager, language, lint/format, type check and tests.

## Decision

- Runtime: Node.js >= 22.12. Node 20 is EOL.
- Package manager: npm. `package-lock.json` committed.
- Modules: ESM (`"type": "module"`, `NodeNext` resolution).
- Language: TypeScript, strict.
- Lint and format: Biome, recommended rules.
- Tests: Vitest.
- `@types/node` pinned to major 22 to match the minimum runtime.
- `npm run check` runs `biome check .`, `tsc --noEmit`, `vitest run`. Must pass before every commit.

## Consequences

- One command validates a change.
- APIs newer than Node 22 are not typed and not used.
- Changing any tool needs a new ADR.
