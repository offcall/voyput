# ADR 0003: Client-Only Web App

## Status

Accepted. "No HEIC conversion" superseded by ADR 0052: HEIC/HEIF photos are turned into JPEG on import.

## Context

voyput is one page where a user brings passport photos and a location CSV, reads stamps with an AI model, reviews them and sees trips. The maintainer deploys it as static files. The old modules ran a local Node server for data and AI calls.

## Decision

- One single-page app built with Vite and React 19. No server, no accounts.
- `vite build` output (`apps/web/dist`) is the deployable artifact.
- UI text is English.
- Accepted photo types: JPEG and PNG. No HEIC conversion.

## Alternatives

- Next.js static export: more framework than a static SPA needs.

## Consequences

- Everything the old server did (CSV parsing, review data, AI calls) runs in the browser.
- No secrets on our side: the user's own API key never leaves their browser except to the AI provider.
