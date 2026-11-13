# ADR 0012: Pixel Retro Visual Style

## Status

Accepted. Supersedes the "no key means follow the system" line of [ADR 0011](0011-theme-in-local-storage.md).

## Context

The maintainer chose a new look: a modern dark UI with pixel-art accents (8-bit fonts and small sprites), playful but driven by real data. The kit (ADR 0005) has neutral blue tokens and system fonts. The app is client-only (ADR 0003) and must not load fonts or images from the network.

## Decision

- Fonts are bundled from npm in `@voyput/ui`: Silkscreen (`@fontsource/silkscreen`, OFL) as `--vp-font-pixel`, Inter (`@fontsource-variable/inter`, OFL) as `--vp-font`. Silkscreen is used only for accents: primary and secondary buttons (uppercase), page and section titles, big numbers, the logo. Body text stays Inter.
- Dark is the default theme: near-black background, dark surfaces, one green accent (`--vp-accent`), muted greys. Light is a "day sky" theme: light blue background, white cards, the same green.
- Theme storage (`voyput:theme`) takes `light`, `dark` or `system`. No key means dark. `system` follows `prefers-color-scheme`. The value is set as `data-theme` on `<html>` before first paint.
- Token names stay the same. New tokens cover the pixel font, the accent border and glow, and the sky art.
- Pixel art is original and lives in code. Each sprite is a grid of characters in TypeScript, drawn as SVG rects with `shape-rendering: crispEdges`. There are no image files and no third-party art. Animation stops under `prefers-reduced-motion`.
- Modern parts stay modern: rounded cards, pill progress bars, smooth charts.

## Alternatives

- Pixel font everywhere: hard to read in body text and tables.
- Fonts from Google Fonts CDN: a network call per load, breaks offline use.
- PNG sprites: blurry when scaled, need an asset pipeline, cannot follow theme colours.

## Consequences

- The web bundle grows by the font files (about 70 kB of woff2 for the latin subsets; other subsets load only when a page uses their characters).
- Colour tokens are `light-dark()` values switched by `color-scheme`, so there is one list for both themes. `getComputedStyle` on a token returns the raw `light-dark(...)` text, so code that needs the colour (canvas) reads it from an element that uses the token.
- A user who never picked a theme now gets dark even with a light system theme.
- New sprites are added as grids in `packages/ui/src/pixel/`.
