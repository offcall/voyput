# ADR 0024: Collect Sources

## Status

Accepted. Supersedes the success header, the five-card stepper and Back/Next of ADR 0016.

## Context

Collect showed progress three times (success header with four stat tiles, a "Next" card, a five-card stepper) and always all five steps. Not every user has both sources: some only have iPhone photo locations, some only passport stamps. The maintainer found the page too busy.

## Decision

- On the first visit, with nothing stored and nothing chosen, `/collect` asks "What do you have?": Photos only, Passport only or Both, plus a quiet "Try with demo data" link (loads the demo and chooses Both). The choice is stored in `db.kv` under `collect:sources` (`photos` | `passport` | `both`). It is changed from a small "Sources: … · change" link next to the step title.
- `buildPlan` takes the choice and `plan.steps` holds only the steps it needs (`visibleSteps`): Photos only → Photo locations, Stays; Passport only → Passports, Extract, Review, Stays; Both or no choice → all five. Stored data wins: passport photos or stamps show the passport steps, locations show their step. `plan.next`, `doneCount`, `toDo`, the nav count and `/collect` follow the shown steps. Hidden step URLs still open.
- The top of Collect is one bar: the title, one row of the shown steps (dot, name, a status only for the open step and steps needing attention) and one button for the next action. On the step that is next, the button turns secondary and leads to the step after. No stat tiles (Insights shows numbers), no Back/Next under the step.
- The Review step counts what Review's queue holds: stamps not reviewed yet plus reviewed stamps with an open warning (an extraction problem or a photo location mismatch not marked "Looks right"). Review is done only when that queue is empty, so the bar and the queue always show the same number.
- `/collect/trips` (Stays) renders no Collect bar: Stays is its own section. Its URL stays.
- `/collect` and the nav open the first shown source step not done, or the last source step when all are; never Stays.

## Consequences

- A user with one source sees two or four steps, not five; the second source is added later by changing the choice or simply importing it.
- Back is the previous step in the bar; there is no separate Back button.
- An old install without the key behaves as Both.
