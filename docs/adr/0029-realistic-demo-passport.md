# ADR 0029: Realistic Demo Passport

## Status

Accepted. Changes what the generated demo of ADR 0010 shows; ADR 0021 (Commons samples) is unchanged. The Review part is superseded by [ADR 0030](0030-day-aware-photo-location-check.md).

## Context

The generated demo passport looked fake: invented places ("Demohrad", "DEMOWO D 039"), a large DEMO watermark on every page, a few identical stamps on clean paper, one stamp cut off by the page edge, 6 countries on 5 pages. It is the first thing a visitor sees and the source of a README recording, so it should read as a used passport and a believable photo history.

## Decision

- **Traveller:** one fictional Kyiv resident, 2016–2025 (`scripts/demo/scenario.ts`): 16 trips to 16 countries, short trips and a three-month summer in Poland, repeated destinations, overland crossings by bus, car and on foot, and from 2022 on travel via the Polish and Moldovan land borders. Places are real and public (airports, border checkpoints, cities); dates and officer numbers are invented. The traveller is described only by these trips.
- **Pages:** 10 visa pages of a fictional passport. They have a guilloche background, page numbers and one small "SPECIMEN · FICTIONAL DEMO DATA" line. Each stamp is drawn in a style for its country (Schengen, Ukraine, Georgia, Armenia, Turkey, UAE, Thailand, a Japanese landing sticker, Montenegro, Moldova) with its date format, entry or exit mark and transport icon. Ink, rotation, pressure and overlap vary, and every stamp stays inside the page. There is no emblem, photo page, MRZ, name or serial number.
- **Photo locations:** about 5,000 `IMG_####.HEIC` rows follow the itinerary. They include airside transits (Doha, Istanbul, Dubai) and in-flight hours without photos. Uuids keep the `demo-` prefix.
- **Review:** stamps stay ground truth and reviewed, except 4 planted problems: a misread day, an unreadable direction, a correct stamp the photos put a day off, and a faint stamp with an unreadable checkpoint. Review's photo-location check warns on one stamp of nearly every same-day crossing. The generator marks those warnings as fine (`dismissed.icloudCheck`), as a traveller who reviewed them would have. Its copy of the check (`scripts/demo/review.ts`) is guarded by a test that runs the real check.
- Pages are written as RGB PNG by a small encoder in the generator (`scripts/demo/png.ts`): lossless and about a third smaller than resvg's RGBA output.

## Consequences

- The demo pages are about 5 MB in total, up from 1.2 MB.
- Transits sit on the day of the exit stamp, with the next stamp a day later. The stay builder places a transit photo taken on the day of an entry stamp after that country's photos (`TODO.md`).
- Changing the trips changes the expected stays, which `apps/web/test/demo.test.tsx` lists in full.
