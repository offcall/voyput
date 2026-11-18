# Third-party material

voyput's own code is under the [MIT licence](LICENSE). These parts come from others and keep their own terms.

## Map data

| What | Where | Source | Terms |
| --- | --- | --- | --- |
| World map, 110m (chart outlines, country names, centroids) | `apps/web/src/features/visualize/assets/world-countries.geojson`, and `packages/core/src/viz/worldTable.generated.ts` derived from it | [Natural Earth](https://www.naturalearthdata.com/) 1:110m countries, as repackaged in [`countries.geo.json`](https://github.com/johan/world.geo.json/blob/master/countries.geo.json) of johan/world.geo.json (features identical) | Natural Earth: public domain. The repackaging: [Unlicense](https://github.com/johan/world.geo.json/blob/master/UNLICENSE) (public domain). |
| Country outlines, 10m (country of a photo location) | `apps/web/src/features/import/csv/assets/country-outlines.json`, written by `scripts/world/outlines.ts` | [Natural Earth](https://www.naturalearthdata.com/) 1:10m admin 0 map units, from [nvkelso/natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) | Public domain. |

## Demo passport pages

The Wikimedia Commons stamp pages in `apps/web/public/demo` (`sample-*.jpg`) are public domain, CC BY 2.0 or CC BY-SA 3.0, each with its author and source in [`apps/web/public/demo/CREDITS.md`](apps/web/public/demo/CREDITS.md). The app shows the same credits in the demo banner. The generated demo pages (`page-*.png`) and demo data are voyput's own.

## Fonts

Bundled into the built site from npm:

| Font | Package | Copyright | Licence |
| --- | --- | --- | --- |
| Inter | `@fontsource-variable/inter` | Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter) | [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/) |
| Silkscreen | `@fontsource/silkscreen` | Copyright 2001 The Silkscreen Project Authors (https://github.com/googlefonts/silkscreen) | [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/) |

The full licence text ships in each package's `LICENSE` file.

## Code

The built site bundles npm packages under permissive licences, among them React, React DOM, Base UI and TanStack Router (MIT) and Dexie (Apache-2.0). `npm run build` writes their licence texts to `apps/web/dist/third-party-licenses.txt`, served as `/third-party-licenses.txt`; each is also in the package's folder under `node_modules` after `npm install`.

## Pixel art

The sprites, icons and share image are drawn in code (`packages/ui/src/pixel/sprites.ts`, `scripts/brand`) and are voyput's own.
