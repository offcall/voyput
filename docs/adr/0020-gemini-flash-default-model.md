# ADR 0020: Gemini 3.8 Flash as Default Model

## Status

Accepted. Supersedes the default model in ADR 0008.

## Context

ADR 0008 made `openai/gpt-6-sol` the default stamp reader without a measurement. A trial on 10 real stamp pages from Wikimedia Commons, scored against a hand-read ground truth, compared it with two Gemini models ([model trial](../model-trial-2026-11.md)).

## Decision

- The default model in Settings is `google/gemini-3.8-flash`. The reasoning effort stays `medium`.
- Users can still pick any image model. Stored settings keep the model the user chose.

## Alternatives

- `google/gemini-3.5-flash-lite`: about 3× cheaper and 5× faster, but in the trial it invented a stamp and misread a year and two countries.
- Keep `openai/gpt-6-sol`: in the trial it missed or misplaced 3 of 13 stamps on hard pages, at a similar cost per page.

## Consequences

- New users read stamps for about $0.015 per page. Busy pages can take up to two minutes.
- A future default change should rerun `scripts/model-trial` with the same pages.
