# ADR 0008: AI Through OpenRouter

## Status

Accepted. Default model superseded by ADR 0020.

## Context

Stamp extraction, validation and rescan need a vision model. There is no server to hold a key, and the old local `pi` bridge does not exist in a browser.

## Decision

- The browser calls OpenRouter's chat completions API directly with the user's own key from Settings.
- Any OpenRouter model that accepts image input can be chosen. Default: `openai/gpt-6-sol`, reasoning effort `medium`.
- All AI calls go through one client module in `apps/web`, so tests replace it in one place.

## Consequences

- The user pays for their own calls and must paste a key before Extract works.
- Tests never call OpenRouter.
