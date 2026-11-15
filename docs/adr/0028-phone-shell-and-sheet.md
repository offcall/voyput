# ADR 0028: Phone Shell and Bottom Sheet

## Status

Accepted. Extends ADR 0023 (navigation) for phones and tablets.

## Context

Block 5 makes the app comfortable on phones (360–430px, portrait and landscape) and tablets (768px). The bottom tab bar held Collect, Stays and Insights, and inside Insights it swapped those for the four views; Settings sat in the top bar beside the theme switch. Other sections need a phone primitive for panels that are side columns or popovers on the desktop.

## Decision

- **Breakpoint.** At 860px and below (`TOUCH_LAYOUT` in `app/useMediaQuery.ts`, the same value as the kit's `.vp-shell` CSS) the shell is a top bar and a bottom tab bar. Tablets (768px) use it too: a 236px sidebar would leave 532px for content, where Insights, Review and the photo grid already fall back to their one-column layouts, and touch tablets get the same thumb-reach bar as phones. The desktop markup is unchanged.
- **Bars.** The top bar holds the logo (to `/`) and the theme switch. The tab bar always has four tabs: Collect (with its x/5 badge), Stays, Insights and Settings. In Insights the four views are one segmented row at the top of the page (`InsightsSwitch` in `app/Layout.tsx`), not tabs. The layout renders either the desktop nav or the touch tabs from `matchMedia`, so no link is in the DOM twice; without `matchMedia` (jsdom) it is the desktop.
- **Space.** Bars keep clear of `env(safe-area-inset-*)` (`viewport-fit=cover`); the page's bottom padding is the bar height plus the inset. `--vp-tabbar-h` is the bar height, for sticky actions above it. Sizes use `dvh`. On a phone held sideways (height ≤ 500px) the top bar scrolls away and the tab bar is one short row. `<meta name="theme-color">` follows the theme.
- **Touch sizes.** Under `pointer: coarse` kit buttons and inputs are at least 44px, inputs use 16px text (no iOS zoom on focus), small buttons keep their look and get a larger invisible hit area.
- **Sheet.** `Sheet` in `@voyput/ui` is the phone panel: Base UI Drawer (a Dialog with swipe), a drag handle, swipe down, Escape, close button or backdrop closes it, focus stays inside, at most 85dvh with the body scrolling, the safe area kept clear. Kit overlays (Dialog, Sheet, Menu) sit above the bars (z-index 100+).
- **Collect bar.** On a narrow bar the step row folds into one "3/5 · Step ▾" button that opens the steps in a `Sheet`; the next action takes the full width.

## Consequences

- A section that needs a phone panel uses `Sheet` instead of its own drawer.
- Layout is checked by screenshots at 360, 390, 430, 844×390 and 768 wide; jsdom has no layout. Real iOS Safari was not available.
