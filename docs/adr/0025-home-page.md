# ADR 0025: Home Page

## Status

Accepted. Supersedes the "`/` opens the first step not done" part of ADR 0016 and ADR 0024.

## Context

`/` redirected to the first unfinished Collect step. A first visitor landed in a wizard without learning what voyput is, and nothing said up front that their passport photos and photo locations never leave the browser. That promise is the main reason to trust the app with that data.

## Decision

- `/` always renders the home page (`features/home`): a hero on `PixelSky` ("Your data stays in your browser", with the one exception named next to it: page images go to the AI the user picks, with their own key, when they read stamps), three "How it works" steps drawn with kit sprites, the Collect "What do you have?" choice (`SourcesChoice`, with "Try with demo data") plus a GitHub link, and a Privacy section.
- With any stored data (`plan.hasData`) a "Welcome back" card comes first: "Continue → <next action>" to `plan.next` (Insights once every step is done), a countries · stays line, and links to Stays and Insights. The rest of the page stays below it.
- Privacy states only what the code does: IndexedDB and localStorage of this browser, no backend, no analytics, cookies or trackers, stamps read by OpenRouter only with the user's own key, straight from the browser. Readers are a list (`STAMP_READERS`), so a local engine is one more entry. The public OpenRouter model list loaded by Settings is named too.
- "Delete everything" clears every IndexedDB table after a confirm; settings, the key and the theme in localStorage stay.
- The sidebar logo links to `/`. No new nav item.
- The repository URL is one constant, `SOURCE_URL` in `features/home/HomePage.tsx`.

## Consequences

- `/collect` keeps its own first-visit question and redirect; links into the app that used `/` to reach Collect now land on the home page.
- Any new network request or storage must update the Privacy text, or the page states something false.
- Demo data loaded from home opens Review; its load summary is not carried into Collect's demo banner.
