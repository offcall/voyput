# Model trial, November 2026

Which OpenRouter model should read stamps by default? Run on 2026-11-13; it led to [ADR 0020](adr/0020-gemini-flash-default-model.md).

## Method

- **Pages:** the 10 Wikimedia Commons stamp pages of the demo (`apps/web/public/demo/sample-*.jpg`, sources in [CREDITS.md](../apps/web/public/demo/CREDITS.md)). Eight are from one Canadian passport (2004–2007) and two from one US passport (2008–2009): airport, rail, sea and land stamps from 19 countries, many faint, rotated or overlapping. Each image is one page, as the app expects.
- **Ground truth:** read by hand, zooming into each stamp ([`scripts/model-trial/groundTruth.ts`](../scripts/model-trial/groundTruth.ts)). It has 38 scored stamps: 36 with a scored date and 33 with a scored direction. Faint dates and unclear directions are not scored. Visas, stay extensions and UK "leave to enter" condition boxes are optional, so they count neither as misses nor as extras. Schengen directions follow the rule in the app's prompt: square corners and an arrow into the box mean entry, rounded corners mean exit.
- **Calls:** the app's own prompt (`buildStampPrompt`, no validity range), its OpenRouter client (`createOpenRouterClient`: reasoning effort `medium`, JSON mode) and its parser (`parsePhotoResponse`). One call per page and model. Answers are cached, and cost comes from OpenRouter's `usage`. The script is [`scripts/model-trial`](../scripts/model-trial/trial.ts).
- **Matching:** on each page, model stamps are paired with truth stamps by the same date first, then the same country. A missed stamp counts as wrong in every column.

## Results

All 10 pages:

| Model | Found | Missed | Extra | Country | Date | Direction | Parse failures | Cost | Avg s/page |
|---|---|---|---|---|---|---|---|---|---|
| `google/gemini-3.8-flash` | 38/38 (100%) | 0 | 0 | 38/38 (100%) | 36/36 (100%) | 30/33 (91%) | 0 | $0.153 | 28.8 |
| `google/gemini-3.5-flash-lite` | 37/38 (97%) | 1 | 1 | 35/38 (92%) | 34/36 (94%) | 30/33 (91%) | 0 | $0.053 | 5.7 |

Baseline on 3 hard pages (19, 21 and 31 of the Canadian passport):

| Model | Found | Missed | Extra | Country | Date | Direction | Parse failures | Cost | Avg s/page |
|---|---|---|---|---|---|---|---|---|---|
| `openai/gpt-6-sol` (old default) | 10/13 (77%) | 3 | 2 | 9/13 (69%) | 9/12 (75%) | 5/10 (50%) | 0 | $0.084 | 21.2 |
| `google/gemini-3.8-flash` | 13/13 (100%) | 0 | 0 | 13/13 (100%) | 12/12 (100%) | 7/10 (70%) | 0 | $0.094 | 60.7 |
| `google/gemini-3.5-flash-lite` | 12/13 (92%) | 1 | 1 | 12/13 (92%) | 12/12 (100%) | 8/10 (80%) | 0 | $0.017 | 6.0 |

Prices on 2026-11-13 (USD per million input / output tokens): gemini-3.8-flash $0.825 / $4.125, gemini-3.5-flash-lite $0.30 / $2.50, gpt-6-sol $2 / $10. The answers in these tables cost **$0.29** in total ($0.153 + $0.053 + $0.084; the 3-page Gemini rows reuse answers from the 10-page runs), under the script's $0.50 budget guard.

## Observations

- **gemini-3.8-flash** found every stamp and read every scored date and country correctly. Its three direction errors are Schengen entry stamps it called exits: Barcelona, Amsterdam 04.05.06 and Roissy-CDG. It is slow on dense pages: page 21 took 122 s and $0.06.
- **gemini-3.5-flash-lite** is about 3× cheaper and 5× faster, but it guesses more. On a faint page it invented an Iceland "Keflavik" stamp in place of Hungary's Kelebia. It read Romania's `21 08 05` as 2015, turned Philippine arrival into Thailand, and tagged a Slovenian rail stamp as German.
- **gpt-6-sol** missed or misplaced 3 of 13 stamps on the hard pages, at about the same cost per page as gemini-3.8-flash.
- **Date check gap (app, not model):** our date check flags correct dates when the printed digits are spaced (`JUL 1 7 2004`, `DEC 3 0 2008`, `2005 -11- 0 6`) or the month is French (`23 JUIL. 2005`). 6 of the 38 demo sample stamps show such a false "does not match printed" warning. Fixed since in `packages/core/src/stamps/dates.ts`.

## Decision

Default model: **`google/gemini-3.8-flash`**, quality first. It was the only model with no missed stamps and no wrong dates, and it costs about $0.015 per page. Users who want speed or a lower bill can pick `google/gemini-3.5-flash-lite` in Settings.

## Limits

- 10 pages from 2 passports, one call per page and model: the result shows a clear quality gap, not a precise ranking.
- None of the pages has Ukrainian or Russian stamps, which the prompt's format guide covers in detail.
- The ground truth is one person's reading. Unclear fields are left unscored rather than guessed.
