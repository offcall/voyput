# ADR 0005: UI Kit

## Status

Accepted

## Context

Several sections were separate apps with their own styles. The rewrite should share one look and one set of controls.

## Decision

- Components in `@voyput/ui` wrap Base UI (`@base-ui/react`) primitives with our class names.
- Styling: one plain CSS file with `--vp-*` tokens, light and dark themes (system preference, overridable with `data-theme` on `<html>`).
- Only components used by at least one section go in the kit.
- Storybook shows the kit for browsing. No Storybook tests.

## Alternatives

- Mantine: styled out of the box, but a large dependency with its own look.
- Own components without primitives: dialogs, tabs and focus handling done by hand.

## Consequences

- A section adds a component to `packages/ui` when a second place needs it, plus a story.
