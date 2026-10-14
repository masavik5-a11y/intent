# Roadmap — Intent

Build order, one milestone at a time. Requirement IDs refer to [PRD.md](PRD.md).

**Current milestone: M1 (started 2026-10-14). M0 has one check left: a second email is
refused on the live site, see the open M0 slice.** Update this line when a milestone is
finished.

## How to work

- One session, one or two slices. A slice is a checkbox below.
- Start of session: read `CLAUDE.md` and this file, say which slice is next, build it.
- A slice is finished when: it works in the running app at desktop and phone width, its
  tests exist and pass, `npm run check` is green, and its box is ticked here.
- Do not start a milestone before the previous one meets its "Done when".
- **Start using the app for real after M3.** Everything after that should be shaped by
  what annoys you in daily use, so the order of M5 to M9 may change. Change it here.
- If a slice turns out bigger than a session, split it here before continuing.

A good first prompt for a new session:

> Read CLAUDE.md and docs/ROADMAP.md. Tell me the next unticked slice and your plan for
> it in a few lines, then build it.

## Overview

| # | Milestone | You get |
| --- | --- | --- |
| M0 | Foundation | An empty, signed-in app running on PC and phone, with tests and deploys working. |
| M1 | Plan a day | Activities with their why, a day grid, the now panel with countdown, the compass. |
| M2 | Track what happened | Done / Partly / Skip, the actual lane, drift, live untracked time, "Not feeling it". |
| M3 | Close the loop | Evening review, plan tomorrow, recurring blocks. **Daily use starts here.** |
| M4 | Notifications and offline | Block-start and ten-minutes-left notifications, morning and evening nudges, offline view. |
| M5 | Pace and goals | Weekly targets with pace, goals with days left. |
| M6 | Feel and speed | Drag and resize, keyboard shortcuts, motion, phone polish. |
| M7 | Week, month, inbox | Wider views, capturing things for later, replanning a slipping day. |
| M8 | Insights and weekly review | Looking back over weeks, you versus last week, the skip check. |
| M9 | Extras | Year bar and life in weeks, shareable week card, export, images. |

---

## M0 — Foundation

**Goal:** a deployed skeleton with every tool wired, so that later milestones are only
about features.

**You (Filip) do once, before or during this milestone:**

- Rename the project folder to a name without a space, for example `intent`. Paths with
  spaces occasionally break command-line tools.
- Create free accounts: GitHub, Convex, Vercel.
- Node 24, npm 11 and Git are already installed on this PC. The GitHub CLI is not; it is
  optional.

**Verify first** (see ARCHITECTURE.md section 15): scaffold command and template;
TanStack Router and Tailwind v4 setup with Vite; `convex/` importing from `shared/`;
how to restrict sign-up in Convex Auth.

**Slices:**

- [x] `git init`, `.gitignore`, first commit containing `CLAUDE.md` and `docs/`.
- [x] Scaffold Vite + React + TypeScript + Convex + Convex Auth. The folder is not empty,
      so scaffold into a temporary folder and move the files in, keeping `CLAUDE.md` and
      `docs/` untouched.
- [x] Run `npx convex ai-files install` so Convex's own guidance is added to `CLAUDE.md`.
- [x] TypeScript strict settings; path aliases for `src/` and `shared/`.
- [x] ESLint (typescript-eslint, Convex plugin, import restrictions from ARCHITECTURE.md
      section 3) and Prettier.
- [x] Vitest running one real test in `shared/`; convex-test running one real test.
- [x] npm scripts: `dev`, `check`, `typecheck`, `lint`, `test`, `build`. Update the
      Commands section of `CLAUDE.md` to match.
- [x] Tailwind v4, shadcn/ui, `src/styles/theme.css` with the colour keys from DESIGN.md
      section 5 for light and dark, the type scale, and the serif voice font.
- [x] TanStack Router: `/` redirects to `/day/<today>`, `/signin`, and placeholder routes
      for the other screens. App shell with nav rail (desktop) and bottom bar (phone).
- [x] `shared/time.ts`: `DateKey`, minute helpers, parsing, formatting, `addDays`, with
      table-driven tests. First real domain code.
- [x] Auth: sign-in screen, password provider, sign-up limited to `ALLOWED_EMAILS`,
      `requireUser(ctx)`, protected routes, sign out.
- [x] PWA: manifest, icons, service worker that precaches the shell. No push yet.
- [x] Private GitHub repository and an Actions workflow that runs `npm run check`.
      Repository github.com/masavik5-a11y/intent (private); the workflow is
      `.github/workflows/check.yml`. The "Check" run for 820ad99 is green (2026-10-14).
- [ ] Production: Convex production deployment and Vercel project, deploying from `main`.
      *Status 2026-10-14:* Convex project `intent` exists; the production deployment
      `diligent-hawk-428` has `JWT_PRIVATE_KEY`, `JWKS` and `ALLOWED_EMAILS`. Vercel holds
      the production deploy key and the site is live; production has the auth tables and
      functions (checked with `npx convex data --prod`). The first Vercel build had a
      `dev:` key and deployed to the development backend instead; the key was replaced.
      Done: the site is https://intent-asda-3b4a.vercel.app (recorded in ARCHITECTURE.md
      section 14) and production's `SITE_URL` points at it. Vercel's Deployment
      Protection is off, so the manifest, icons and service worker answer 200 (checked
      with curl), and the bundle talks to `diligent-hawk-428`. Filip's account exists
      (production has exactly one user and one account) and the app is installed on the
      PC and the phone.
      The two development deploy keys ("df" and "intent") are deleted in the Convex
      dashboard.
      **Left:** Filip confirms that creating an account with any other email on the live
      site answers "Sign-up is closed for this address".

**Done when:** you are signed in to the deployed app on the PC and on the phone, it is
installed as an app on both, a second email cannot sign up, and `npm run check` is green
locally and in GitHub Actions.

**Not in this milestone:** any planner feature.

---

## M1 — Plan a day

**Goal:** plan any day by hand and see the current block with its why and its countdown.
Covers T1–T7 (plan lane), I1–I4, U1, U2, V1, P4, S1, S5.

**Slices:**

- [x] Schema: `settings`, `categories`, `activities`, `blocks` (plan fields, status
      always `planned` for now), `compass`.
- [x] On first sign-in: create settings (time zone from the device) and seed the default
      categories.
- [x] `shared/blocks.ts` (`effectiveIntent`), `shared/lanes.ts` (`findOverlap`, including
      blocks that cross midnight), `shared/grid.ts` (minutes to pixels, Fit zoom), with tests.
- [x] `convex/model/blocks.ts`: create, update, delete, enforcing the invariants in
      ARCHITECTURE.md section 5. convex-test coverage for overlap, foreign documents,
      invalid times.
- [x] Activities screen: list by category, create, edit, archive. All intent fields
      (why, how, if-then, minimum version, cost of skipping, default done-when), grouped
      as "Intent" and "For hard days"; the pressure switch, default duration, notify switch.
- [x] Day screen: header with date navigation, hour grid, plan lane with block cards, an
      empty actual lane, now line, `useNow()`. The date is in the URL.
- [x] Quick add (button, `N`, click on an empty slot, the phone's +).
- [x] Block detail panel: edit, delete, inherited intent shown as inherited, per-block
      overrides, focus, done-when.
- [x] Blocks that cross midnight: creation, and the tail at the top of the next day.
- [x] Now panel: current block by plan, done-when, why (serif), how, if-then, minimum,
      countdown bar for pressure blocks and plain time left otherwise, up next, and the
      between-blocks state. Uses `shared/pace.ts` `countdown` with tests.
- [x] Compass screen (V1): "The life I'm building" and "The life I refuse to drift into",
      side by side, with the writing prompts from PRINCIPLES.md while empty and the date
      last edited.
- [x] First-run setup: wake and sleep times, first three activities with their why and
      cost of skipping, then an invitation to write the compass (skippable).
- [ ] Phone layout for everything above. Light and dark themes with a manual switch.

**Done when:** you can plan tomorrow completely on the PC, see it on the phone within a
second, an overlapping block is refused with a clear message, a sleep block crossing
midnight shows correctly on both days, at the right time the now panel shows the right
block with its why and a draining bar, and your vision and anti-vision are written and
saved on the Compass screen.

**Not in this milestone:** statuses, the actual lane's content, drag and drop,
recurrence, notifications.

---

## M2 — Track what happened

**Goal:** the actual lane works, with one-tap logging. Covers A1–A5, T8, U4, V2–V4, R3.

**Slices:**

- [ ] Schema: status, actual times, `skipReason`, `note`, `minimumChosen`.
- [ ] `shared/`: `applyStatus`, `defaultActual`, `editTarget`, `untrackedGaps`,
      `summarizeDay`, each with tests for the rules in PRD section 7.
- [ ] Done, Partly, Skip and Undo from the now panel and block detail, with optimistic
      updates. Partly offers quick choices; Skip offers optional reasons.
- [ ] Actual lane: done and partly blocks at their actual times, the current block as a
      growing bar, skipped blocks outlined in the plan lane.
- [ ] Log an unplanned entry (Drift first, `L`), defaulting to "from the last entry until
      now". Edit actual times on any block.
- [ ] Untracked time drawn as a hatch that grows with the now line; day totals (on
      purpose, drift, untracked) updating every minute.
- [ ] The edit rule in the UI: past is edited as actual, future as plan; on past days the
      plan is frozen behind an explicit "Edit plan".
- [ ] "Not feeling it" view (V2, DESIGN.md section 4b), opened from the now panel or `X`:
      if-then, minimum version, cost of skipping, anti-vision, vision, in that order,
      then Start, Start the minimum, Skip on purpose.
- [ ] "Start the minimum" (V3): sets `minimumChosen`; finishing records Partly with the
      minimum noted, never a skip. Tested in `applyStatus`.
- [ ] Guard (V4): a test asserting that anti-vision and cost-of-skipping text never
      reach the Today screen by default; the notification side is asserted in M4.
- [ ] Past days open with both lanes, totals and notes.

**Done when:** for one real day you can record everything that happened with single taps
plus one or two unplanned entries, and the day's two lanes and three totals match what
you remember. Marking Done after an overrun never creates an overlap. On a block you
don't want to do, one press of "Not feeling it" shows your if-then, minimum, cost of
skipping, anti-vision and vision, and "Start the minimum" works.

**Not in this milestone:** the review flow, insights.

---

## M3 — Close the loop

**Goal:** the full daily loop, cheap enough to do every day. Covers R1, R2, P1–P3, P5.

**Slices:**

- [ ] Schema: `days`, `recurrences`, and `recurrenceId` / `detached` on blocks.
- [ ] Evening review: resolve unmarked blocks, fill gaps of 30 minutes or more, three
      prompts with optional rating and energy, then hand over to planning. Every step
      skippable. `R` starts it.
- [ ] Plan tomorrow screen: tomorrow's plan lane, add blocks, main focus field, "Copy
      from a date".
- [ ] Main focus shown on the now panel that day.
- [ ] `shared/recurrence.ts` with tests. Repeat settings in block detail (weekdays, end
      date).
- [ ] Materialisation: daily cron for a 14-day window, and on demand for later dates.
      Idempotent, tested.
- [ ] Editing a repeating block: "this one" (detaches it) or "this and following".
- [ ] Returning after days away: today's plan and "Welcome back. Plan today?", nothing
      about the missed days.

**Done when:** you have run the whole loop on three consecutive real days; the review
takes under three minutes and planning tomorrow under two; sleep, routine and gym appear
by themselves.

**From here on, use the app every day and note what gets in the way.**

---

## M4 — Notifications and offline

**Goal:** the app reaches you at the right moments, and opens without a connection.
Covers N1–N4, U3, S2, S4.

**Verify first:** time-zone conversion in Convex's default runtime; minute crons on the
free plan; Web Push on your actual phone with battery optimisation on; the Convex client
API for connection state.

**Slices:**

- [ ] VAPID keys generated and stored as environment variables (ARCHITECTURE.md
      section 12).
- [ ] Service worker: `push` and `notificationclick` handlers.
- [ ] `pushSubscriptions` table; Settings: "Enable notifications on this device", device
      list, "Send a test notification".
- [ ] `push.send` Node action, removing dead subscriptions.
- [ ] Dispatcher cron for block starts, with tests: sent once, respects the global and
      per-activity switches, skips blocks already marked, and never includes anti-vision
      or cost-of-skipping text in any payload (V4).
- [ ] Ten-minutes-left for pressure blocks, including blocks that cross midnight, with
      tests.
- [ ] Morning and evening nudges with times in Settings.
- [ ] Offline: snapshot of today, offline banner, controls disabled.
- [ ] Android check: notifications arrive with the app closed for an hour; note any
      battery setting that has to be changed.

**Done when:** for two days every block start arrives on the phone within about a minute
with the why in it, deep work blocks warn ten minutes before the end with the finish
line, no notification ever arrives twice, and in flight mode the app opens and shows
today's plan read-only.

---

## M5 — Pace and goals

**Goal:** deadlines for a life without deadlines. Covers U5, U6.

**Slices:**

- [ ] Schema: `goals`, `weeklyTargetMin` on categories, `goalId` on activities.
- [ ] `shared/pace.ts`: `weeklyPace`, `daysLeft`, with tests for the pace rules in PRD
      section 7 (week boundaries, today not yet counted, target reached, no target).
- [ ] Compass screen: goals list (create, edit, mark done or dropped) and the weekly
      target per category.
- [ ] Link an activity to a goal. Goal chip with days left on the now panel.
- [ ] Pace line on the now panel for the current category.

**Done when:** during a deep work block the now panel shows the goal with days left and
"Deep work X of Yh · N days left · ahead/behind by Z", and the numbers match a hand count.

---

## M6 — Feel and speed

**Goal:** the app is a pleasure to operate. Covers T9, T10, and DESIGN.md sections 3, 6,
8, 11.

**Slices:**

- [ ] Drag to move and resize, snapping to 5 minutes, obeying the edit rule and the
      no-overlap rule, with a non-drag alternative. Long-press to drag on phone.
- [ ] Keyboard shortcuts and the `?` overlay.
- [ ] Zoom levels and compressed sleep.
- [ ] Motion pass: check-off, blocks entering the actual lane, panel changes; reduced
      motion respected.
- [ ] Optimistic updates for quick add and block edits (ARCHITECTURE.md section 8), so
      a new block appears before the server answers.
- [ ] Phone pass: collapsible now card, bottom bar, sheets, 44 px targets.
- [ ] Accessibility pass: focus order, names, contrast in both themes.
- [ ] Playwright smoke test: sign in, create a block, mark it done, see it in the actual
      lane.

**Done when:** a normal day can be run from the keyboard alone on the PC, and with one
thumb on the phone.

---

## M7 — Week, month, inbox

**Goal:** see beyond today. Covers P6, P7, P8, T11.

**Slices:**

- [ ] Week view: seven columns; past days show both lanes; pace per target in the header.
- [ ] Month view: non-recurring blocks as labels; click a day to open or add.
- [ ] Inbox: schema, capture from anywhere, schedule onto a day.
- [ ] Replan: shift the rest of today by N minutes; push a block to tomorrow.

**Done when:** a wedding three weeks away can be added from the month view in under
twenty seconds and is visible when that week comes.

---

## M8 — Insights and weekly review

**Goal:** the data pays you back. Covers R4–R8, V5. Needs at least two weeks of real data.

**Slices:**

- [ ] Insight aggregation in `shared/summary.ts` with tests; a range query capped at 62
      days.
- [ ] Insights screen, 7 and 30 days: on purpose versus drift per day, planned versus
      actual per activity, most skipped, drift by time of day.
- [ ] Estimation hint when planning ("you plan 3h, you average 1h 50m").
- [ ] Weekly review: week numbers, pace, you versus last week, three prompts, the
      obstacle question, "Reread your compass" (V5), and once a quarter "Is this still
      true? Rewrite it." based on the compass's last-edited date.
- [ ] Skip check after three skips in seven days, linking to the cost of skipping.

**Done when:** the weekly review answers "was this week better than last week, and what
do I change?" in five minutes.

---

## M9 — Extras

Build only what you still want after a month of use. Covers R9–R11, V6, U7.

- [ ] Year progress bar and optional life-in-weeks grid in the weekly review.
- [ ] Shareable week card generated as an image on the device.
- [ ] Export all data as JSON.
- [ ] One image each for vision and anti-vision.
- [ ] Goals grouped by horizon.
- [ ] Done and Skip buttons inside notifications.
- [ ] A "committed plan" snapshot each morning (PRD section 10, open question).

---

## Changing this roadmap

Reordering after M3 is expected. When you do: move the slices, update the Overview
table, and if a requirement changes, change PRD.md in the same commit.
