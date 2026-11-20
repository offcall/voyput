# ADRs

Format and rules: `AGENTS.md`, section ADR Rules.

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-use-architecture-decision-records.md) | Use Architecture Decision Records | Accepted |
| [0002](0002-toolchain.md) | Toolchain | Accepted; module resolution superseded by 0004; dev runtime minimum amended by 0043 |
| [0003](0003-client-only-web-app.md) | Client-Only Web App | Accepted |
| [0004](0004-workspace-layout.md) | Workspace Layout | Accepted |
| [0005](0005-ui-kit.md) | UI Kit | Accepted |
| [0006](0006-routing-and-state.md) | Routing and State | Accepted; hash history superseded by 0013; section state amended by 0038 |
| [0007](0007-browser-storage.md) | Browser Storage | Accepted; `trips` table superseded by 0019; upgrade rule amended by 0039 |
| [0008](0008-ai-through-openrouter.md) | AI Through OpenRouter | Accepted; default model superseded by 0020 |
| [0009](0009-testing.md) | Testing | Accepted |
| [0010](0010-demo-data-generator.md) | Demo Data Generator | Accepted; amended by 0021 (Commons pages) and 0029 (realistic passport) |
| [0011](0011-theme-in-local-storage.md) | Theme in localStorage | Accepted; default with no key superseded by 0012 |
| [0012](0012-pixel-retro-visual-style.md) | Pixel Retro Visual Style | Accepted |
| [0013](0013-browser-history-routes.md) | Browser History Routes | Accepted; Collect URLs superseded by 0016, `/visualize` by 0023, `/` by 0025 |
| [0014](0014-route-and-explore-core-modules.md) | Route and Explore Core Modules | Accepted; stays from trips superseded by 0019 |
| [0015](0015-collect-and-visualize-navigation.md) | Collect and Visualize Navigation | Accepted; Collect part superseded by 0016, Visualize part by 0023 |
| [0016](0016-collect-wizard.md) | Collect Wizard | Accepted; header, stepper and Back/Next superseded by 0024, nav by 0023, `/` by 0025 |
| [0017](0017-photo-location-window-setting.md) | Photo Location Window Setting | Accepted; how `checkStamp` picks the photo superseded by 0030 |
| [0018](0018-stamp-read-date.md) | Stamp Read Date | Accepted |
| [0019](0019-stays-as-source-of-truth.md) | Stays as Source of Truth | Accepted; home and derived trips superseded by 0022 |
| [0020](0020-gemini-flash-default-model.md) | Gemini 3.8 Flash as Default Model | Accepted |
| [0021](0021-commons-sample-pages-in-demo.md) | Commons Sample Pages in the Demo | Accepted |
| [0022](0022-stays-without-home.md) | Stays Without Home | Accepted |
| [0023](0023-navigation-and-insights.md) | Navigation and Insights | Accepted |
| [0024](0024-collect-sources.md) | Collect Sources | Accepted; `/` part superseded by 0025 |
| [0025](0025-home-page.md) | Home Page | Accepted |
| [0026](0026-local-ai-engine.md) | Local AI Engine | Accepted; Codex opt-in superseded by 0032; run command and pairing link amended by 0035; trusted origin by 0042 |
| [0027](0027-photo-export-script-in-tools.md) | Photo Export Script in tools/ | Superseded by 0033 |
| [0028](0028-phone-shell-and-sheet.md) | Phone Shell and Bottom Sheet | Accepted |
| [0029](0029-realistic-demo-passport.md) | Realistic Demo Passport | Accepted; Review part superseded by 0030 |
| [0030](0030-day-aware-photo-location-check.md) | Day-Aware Photo Location Check | Accepted; which side of the stamp warns amended by 0044 |
| [0031](0031-stays-flag-changed-evidence.md) | Stays Flag Changed Evidence | Accepted |
| [0032](0032-codex-on-by-default.md) | Codex On by Default | Accepted |
| [0033](0033-photo-export-in-plain-sh.md) | Photo Export in Plain sh | Accepted; run command amended by 0035, outline source by 0037, library access by 0041 |
| [0034](0034-photo-crossings-count-as-confirmed.md) | Photo Crossings Count as Confirmed | Accepted |
| [0035](0035-download-verify-run.md) | Download, Verify, Run | Accepted |
| [0036](0036-stays-saves-diffs-and-follows-outside-changes.md) | Stays Saves Diffs and Follows Outside Changes | Accepted |
| [0037](0037-country-outlines-from-map-units.md) | Country Outlines from Map Units | Accepted (amends 0033) |
| [0038](0038-shared-data-module.md) | Shared Data Module | Accepted (amends 0006) |
| [0039](0039-frozen-database-upgrades.md) | Frozen Database Upgrades | Accepted (amends 0007) |
| [0040](0040-csv-import-in-a-worker.md) | CSV Import in a Worker | Accepted |
| [0041](0041-read-only-photos-library-access.md) | Read-Only Photos Library Access | Accepted (amends 0033) |
| [0042](0042-voyput-local-site-flag.md) | voyput-local Site Flag | Accepted (amends 0026) |
| [0043](0043-node-22-22-for-development.md) | Node 22.22 for Development | Accepted (amends 0002) |
| [0044](0044-implausible-stamp-dates-read-as-undated.md) | Implausible Stamp Dates Read as Undated | Accepted |
| [0045](0045-photo-check-looks-one-side-of-a-crossing.md) | Photo Check Looks One Side of a Crossing | Accepted (amends 0030) |
| [0046](0046-photo-check-suggests-a-misread-year.md) | Photo Check Suggests a Misread Year | Accepted (amends 0030, 0045) |
