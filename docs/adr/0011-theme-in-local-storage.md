# ADR 0011: Theme in localStorage

## Status

Accepted. The "no key means follow the system" line is superseded by [ADR 0012](0012-pixel-retro-visual-style.md).

## Context

The app has a light, dark and system theme, set as `data-theme` on `<html>` (ADR 0005). The choice must apply before the first paint, or a dark-theme user sees a white flash on every load. A script in `index.html` runs before the app and can only read storage synchronously; IndexedDB (ADR 0007) is asynchronous.

## Decision

- The theme choice is stored in `localStorage` under `voyput:theme`, value `light` or `dark`. No key means "follow the system".
- An inline script in `apps/web/index.html` reads it and sets `data-theme` before the app loads; `apps/web/src/app/theme.ts` reads and writes it at runtime.
- It is kept apart from `voyput:settings`, which belongs to the Settings page and its context.

## Consequences

- The theme survives reloads and is lost with site data, like the settings.
- If storage is blocked, the theme falls back to the system choice; the switch still works for the open tab.
