# Architecture — Intent

Technical design. Product behaviour is defined in [PRD.md](PRD.md); this document says
how it is built. Schema and code here are drafts to implement from, not finished code:
confirm current library APIs before writing them.

## 1. Overview

```
 Desktop browser / installed PWA            Android installed PWA
            │                                        │
            └──────────── WebSocket (reactive queries, mutations) ───────────┐
                                                                             ▼
                                                              ┌──────────────────────────┐
   Vercel (static hosting of the built SPA)                   │ Convex                   │
                                                              │  database                │
   Browser push services  ◄── Web Push (VAPID) ───────────────│  queries / mutations     │
        │                                                     │  cron (every minute)     │
        ▼                                                     │  Node action: web-push   │
   Service worker shows the notification                      │  auth (Convex Auth)      │
                                                              └──────────────────────────┘
```

There is no custom server. The frontend is a static single-page app. Convex is the
database, the API, the realtime sync, the scheduler and the auth provider.

## 2. Stack and reasons

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, strict | One language end to end; types from the database schema reach the UI. |
| Frontend | React + Vite | Simple SPA, fast dev loop, no server rendering needed. |
| Routing | TanStack Router | Type-safe routes and search params (the date lives in the URL). |
| Styling | Tailwind CSS v4 + shadcn/ui | Accessible primitives (dialog, popover, sheet) without designing them; tokens as CSS variables. |
| Backend | Convex | Realtime sync between PC and phone with no sync code; schema validation; built-in cron and scheduler for notifications; TypeScript functions instead of SQL and row-level-security policies. |
| Auth | Convex Auth, password provider | No third service, no email provider needed for one user. |
| PWA | vite-plugin-pwa, `injectManifest` | A custom service worker is needed for push events. |
| Push | Web Push with VAPID, `web-push` in a Convex Node action | Works in installed PWAs on Android and in desktop Chrome and Edge. |
| Dates | date-fns | Small, tree-shakeable. Only for formatting and calendar-date arithmetic. |
| Icons | lucide-react | Default with shadcn/ui. |
| Tests | Vitest, convex-test, Testing Library; Playwright later | Fast unit tests for the domain logic are where most of the value is. |
| Lint/format | ESLint (typescript-eslint, @convex-dev/eslint-plugin) + Prettier | The Convex plugin catches common backend mistakes. |
| Hosting | Vercel + Convex cloud, free tiers | Enough for one user by a wide margin. |

Alternatives considered:

- **Supabase.** Mature auth and Postgres, but free projects pause after 7 days without
  activity, and notifications would need SQL cron plus an edge function plus row-level
  security. More moving parts for the same result.
- **Dexie Cloud (local-first).** Best offline story, but no server-side scheduler, so
  push notifications would need a separate service. Offline was rated "rarely, read-only
  is fine", notifications were rated essential, so this lost.

## 3. Repository layout

```
/
├─ CLAUDE.md
├─ docs/
├─ shared/                     Pure TypeScript. No React, no Convex, no Date.now().
│  ├─ time.ts                  DateKey, minutes, parsing, formatting, addDays
│  ├─ blocks.ts                Block shape helpers, effective intent, status transitions
│  ├─ lanes.ts                 Overlap detection, untracked gaps, default actual times
│  ├─ summary.ts               Day totals, insights aggregation
│  ├─ pace.ts                  Countdown, weekly pace against a target, days left to a goal
│  ├─ recurrence.ts            Which dates a rule produces
│  ├─ grid.ts                  Minutes ↔ pixels, snapping, sleep compression
│  └─ *.test.ts
├─ convex/
│  ├─ schema.ts
│  ├─ auth.ts, auth.config.ts, http.ts
│  ├─ lib/auth.ts              requireUser(ctx)
│  ├─ model/                   Business rules per table; the only place that writes
│  │  ├─ blocks.ts
│  │  ├─ activities.ts
│  │  └─ …
│  ├─ blocks.ts                Public queries and mutations (thin)
│  ├─ activities.ts, categories.ts, days.ts, settings.ts, recurrences.ts
│  ├─ notifications.ts         Dispatcher mutation (internal)
│  ├─ push.ts                  "use node" action that sends Web Push
│  ├─ crons.ts
│  └─ *.test.ts
├─ src/
│  ├─ main.tsx, router.tsx
│  ├─ routes/                  Route files: thin, compose features
│  ├─ features/
│  │  ├─ day/                  Grid, lanes, block card, now line, day header
│  │  ├─ now/                  Now panel, countdown, "Not feeling it" view
│  │  ├─ compass/              Vision and anti-vision
│  │  ├─ goals/                Goals and weekly targets (M5)
│  │  ├─ block-detail/
│  │  ├─ review/
│  │  ├─ planning/
│  │  ├─ activities/
│  │  ├─ settings/
│  │  └─ …
│  ├─ components/ui/           shadcn primitives
│  ├─ lib/                     Hooks and helpers shared by features (useNow, theme, offline snapshot)
│  ├─ styles/theme.css         Design tokens (colour keys, radii, type scale)
│  └─ sw.ts                    Service worker (precache, push, notificationclick)
└─ e2e/                        Playwright (added in M6)
```

Import rules: `shared/` imports nothing from `src/` or `convex/`. `src/` may import from
`shared/` and from `convex/_generated/`. `convex/` may import from `shared/`.
Enforce with an ESLint `no-restricted-imports` rule.

## 4. Time model

This is the decision most likely to cause bugs if it is done loosely, so it is fixed here.

- A block belongs to a **local calendar day**: `date` is a string `"YYYY-MM-DD"` (type
  `DateKey`).
- Times are **integer minutes from local midnight of that date**. `plannedStartMin` is in
  `[0, 1440)`. Start + duration may exceed 1440: that is a block crossing midnight.
  `actualStartMin` is in `[0, 2880)`, because a block planned before midnight can begin
  after it, and its end stays within the next day (`actualStartMin + actualDurationMin
  <= 2880`). So every span of a block dated D, plan or actual, lies inside
  `[D 00:00, D+2 00:00)`, which is what keeps the three-day window below sufficient.
- All minutes are multiples of 5. Durations are `[5, 1440]`.
- Block times are **floating local time**. A block at 15:00 is at 15:00 wherever the user
  is. No UTC timestamps are stored for block times, and none are derived and stored.
- `Date` objects are created only at the edges: reading "now" in the UI (`useNow`), and
  in the notification dispatcher. Everything in between works on `DateKey` and minutes.
- "Now" in the UI comes from one hook, `useNow()`, which ticks once a minute and returns
  `{ date: DateKey, minute: number }`. Components never call `new Date()` themselves.
- "Today" in the UI is the day whose grid holds now: `gridDayOf(now, gridStartMin)`
  (`useToday()` in `src/lib/useToday.ts`). Until the grid's start, 05:00 by default,
  the app stays on the day that is ending; blocks are still stored on their calendar
  date.
- The server needs the user's zone only to answer "what is the local date and minute
  right now?" for notifications. It uses `settings.timeZone` (IANA name, saved from the
  device) with `Intl.DateTimeFormat(..., { timeZone }).formatToParts(now)`.
- The grid of day D shows 24 hours from `gridStartMin` on D, that is
  `[D gridStart, D+1 gridStart)` (DESIGN.md section 3; `shared/grid.ts`). Every moment
  appears in exactly one day's grid. So a day view loads blocks with `date` D − 1 (tails
  that cross into D), D, and D + 1 (blocks before `gridStartMin` on the next calendar
  day, which sit at the bottom). The no-overlap check reads the same three days
  (`overlapWindow` in `shared/lanes.ts`). Week and month views load a date range
  through the same index.

`shared/time.ts` exposes the only functions allowed to parse or format these values:
`parseDateKey`, `toDateKey`, `addDays`, `minutesToLabel`, `isValidMinute`, and so on.

## 5. Data model

Draft Convex schema. Tables marked with a milestone are added in that milestone. The
real one is `convex/schema.ts`; where they differ, it wins. M2 made the plan times
optional (unplanned entries) and added the statuses and actual fields. M3 added `days`,
`recurrences`, and `recurrenceId` / `detached` on blocks, all optional on the existing
table so production's rows fit as they are. M5 added `goals`, and `weeklyTargetMin` on
categories and `goalId` on activities, both optional, plus an index on blocks by
activity and date.

```ts
import { defineSchema, defineTable } from "convex/server";
import { v, type VString } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// A DateKey or ColorKey in a document; the model checks the value (see section 17).
export const vDateKey = v.string() as VString<DateKey>;
export const vColorKey = v.string() as VString<ColorKey>;

export const categoryKind = v.union(
  v.literal("intentional"),
  v.literal("maintenance"),
  v.literal("drift"),
);

export const blockStatus = v.union(
  v.literal("planned"),
  v.literal("done"),
  v.literal("partial"),
  v.literal("skipped"),
);

// PRD A1's optional reasons; shared/blocks.ts, SKIP_REASONS.
export const skipReason = v.union(
  v.literal("tired"),
  v.literal("noTime"),
  v.literal("choseOther"),
  v.literal("forgot"),
  v.literal("other"),
);

const intentFields = {
  doneWhen: v.optional(v.string()),
  why: v.optional(v.string()),
  how: v.optional(v.string()),
  ifThen: v.optional(v.string()),
  minimumVersion: v.optional(v.string()),
  costOfSkipping: v.optional(v.string()),
};

export default defineSchema({
  ...authTables,

  // M1
  settings: defineTable({
    userId: v.id("users"),
    timeZone: v.string(), // IANA, e.g. "Europe/Prague"
    gridStartMin: v.number(), // default 300
    weekStartsOn: v.number(), // 1 = Monday
    wakeMin: v.number(), // the waking part of the day, which Fit zoom shows whole
    sleepMin: v.number(),
    setupCompletedAt: v.optional(v.number()), // first-run setup finished or skipped
    // M4
    notifyBlockStart: v.optional(v.boolean()),
    notifyEndingSoon: v.optional(v.boolean()),
    morningNudgeMin: v.optional(v.number()),
    eveningNudgeMin: v.optional(v.number()),
    lastMorningNudgeDate: v.optional(v.string()),
    lastEveningNudgeDate: v.optional(v.string()),
    // M9
    birthDate: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  // M1: one row per user. The vision and anti-vision texts.
  compass: defineTable({
    userId: v.id("users"),
    vision: v.optional(v.string()),
    antiVision: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // M1
  categories: defineTable({
    userId: v.id("users"),
    name: v.string(),
    kind: categoryKind,
    colorKey: vColorKey,
    icon: v.string(),
    sortOrder: v.number(),
    archived: v.boolean(),
    weeklyTargetMin: v.optional(v.number()), // M5
  }).index("by_userId", ["userId"]),

  // M1
  activities: defineTable({
    userId: v.id("users"),
    name: v.string(),
    categoryId: v.id("categories"),
    icon: v.optional(v.string()),
    defaultDurationMin: v.number(),
    notify: v.boolean(),
    pressure: v.boolean(), // countdown bar and ten-minutes-left warning
    archived: v.boolean(),
    goalId: v.optional(v.id("goals")), // M5
    ...intentFields,
  }).index("by_userId", ["userId"]),

  // M1 (plan fields), M2 (status and actual fields)
  blocks: defineTable({
    userId: v.id("users"),
    date: vDateKey,
    title: v.string(),
    focus: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    categoryId: v.id("categories"),

    plannedStartMin: v.optional(v.number()),
    plannedDurationMin: v.optional(v.number()),

    status: blockStatus,
    actualStartMin: v.optional(v.number()),
    actualDurationMin: v.optional(v.number()),
    skipReason: v.optional(skipReason),
    note: v.optional(v.string()),
    minimumChosen: v.optional(v.boolean()), // "Start the minimum" was used (PRD V3)

    ...intentFields, // per-block overrides; unset means "inherit from the activity"

    recurrenceId: v.optional(v.id("recurrences")), // M3
    detached: v.optional(v.boolean()), // M3: plan edited by hand, leave it alone
    notifiedAt: v.optional(v.number()), // M4: start notification sent
    endingNotifiedAt: v.optional(v.number()), // M4: ten-minutes-left sent
  })
    .index("by_userId_and_date", ["userId", "date"])
    .index("by_recurrenceId_and_date", ["recurrenceId", "date"]) // M3
    .index("by_activityId_and_date", ["activityId", "date"]), // M5: hours invested

  // M3
  days: defineTable({
    userId: v.id("users"),
    date: vDateKey,
    mainFocus: v.optional(v.string()),
    wentWell: v.optional(v.string()),
    drifted: v.optional(v.string()),
    changeTomorrow: v.optional(v.string()),
    rating: v.optional(v.number()),
    energy: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
  }).index("by_userId_and_date", ["userId", "date"]),

  // M3
  recurrences: defineTable({
    userId: v.id("users"),
    activityId: v.optional(v.id("activities")),
    title: v.string(),
    focus: v.optional(v.string()),
    categoryId: v.id("categories"),
    startMin: v.number(),
    durationMin: v.number(),
    weekdays: v.array(v.number()), // 0 = Sunday … 6 = Saturday
    startDate: vDateKey,
    endDate: v.optional(vDateKey),
    materializedThrough: vDateKey, // every date up to here has been created
  }).index("by_userId", ["userId"]),

  // M4
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    deviceLabel: v.string(),
    lastSeenAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // M5
  goals: defineTable({
    userId: v.id("users"),
    title: v.string(),
    why: v.optional(v.string()),
    dueDate: v.optional(vDateKey),
    createdOn: vDateKey, // the device's day it was made; hours invested count from it
    status: v.union(v.literal("active"), v.literal("done"), v.literal("dropped")),
    sortOrder: v.number(),
  }).index("by_userId", ["userId"]),

  // M7: inboxItems. Designed when that milestone starts.
});
```

### Invariants (enforced in `convex/model/blocks.ts`, tested)

1. A block has plan times, actual times, or both. Never neither. Start and duration are
   set or unset together.
2. `planned` and `skipped` blocks have no actual times. `done` and `partial` blocks have
   actual times.
3. An unplanned entry has no plan times and status `done`, and starts on its own day
   (`actualStartMin < 1440`), as a plan start does.
4. Minutes are integers, multiples of 5, within the ranges in section 4. A skip reason
   only on a skipped block. Invariants 1 to 4 are one pure function,
   `blockShapeProblem` in `shared/blocks.ts`, run on the fields a block is about to
   have before every write.
5. No two blocks of the same user overlap within the plan lane, and none within the
   actual lane, taking midnight-crossing tails from the previous day into account.
6. `date` is a valid `DateKey`. `categoryId` and `activityId` belong to the same user.
7. `title` is 1–80 characters after trimming; text is trimmed, blank means unset, and
   lengths are capped (`shared/text.ts`: focus 120, intent fields 1000, note 200,
   compass 10,000).

The schema validates shapes; the model validates rules. Violations throw a `ConvexError`
with a stable `code` (`"OVERLAP"`, `"INVALID_TIME"`, `"NOT_FOUND"`, …) that the UI maps to
a message.

### Effective intent

`effectiveIntent(block, activity)` in `shared/blocks.ts` returns, for each intent field,
the block's value if set, otherwise the activity's. The UI shows inherited text as such.
Editing an activity's why therefore updates every block that has not overridden it,
including past ones. That is intended: the why is a living statement.

## 6. Plan versus actual logic

All in `shared/`, all pure, all unit-tested. Rules are in PRD.md section 7.

| Function | Does |
| --- | --- |
| `editTarget(block, now)` | Returns `"plan"` or `"actual"`: which set of times an edit changes (rule 4). |
| `defaultActual(plan, lane, now)` | Actual times when marking Done: the plan, the start pushed past an overrun keeping the planned end, cut where another entry begins, ending now on a running block (rule 5). |
| `liveActual(plan, lane, now)` | The running block's growing bar: where Done would start it, up to this minute. `liveActualLane(blocks, now)` is the actual lane with it. |
| `findOverlap(candidate, lane)` | The block that a candidate would collide with, or none. |
| `untrackedGaps(actualLane, window, minLen)` | Stretches not covered by any actual entry. |
| `summarizeDay(blocks, kindOf, day, gridStart, now)` | Minutes on purpose, drift, maintenance, untracked for a day's grid, counting the running block. Planned versus actual per activity joins it in M8. |
| `applyStatus(block, action, lane, now)` | The field changes for Done, Partly, Skip, Undo, or why it cannot be done. |
| `partlyChoices(plannedMin, soFarMin)` | Quick lengths for Partly. |
| `countdown(block, now)` | Minutes left, fraction remaining, minutes over. Drives the draining bar. |
| `weekStart(date, weekStartsOn)`, `weekDays` | The week holding a day, from the configured first weekday. |
| `completedDays(today, weekStartsOn, todayReviewed)` | Days of the week that count as completed: those before today, and today once its review is closed (pace rule 2). |
| `weekProgress(blocks, first, gridStart, now)` | Actual minutes per category in the week's seven grids, with the running block up to now (pace rule 1). |
| `weeklyPace(targetMin, progressMin, completedDays)` | Expected so far, days left (7 − completed), ahead, behind or on pace, minutes a day still needed when behind (PRD "Pace rules"). `paceText` words it. |
| `daysLeft(dueDate, today)` | Calendar days to a goal's due date; negative when over. `daysLeftText` words it. |

The client uses these for optimistic updates and for rendering; the server uses the same
functions to validate and to apply. One implementation, two callers.

## 7. Convex conventions

- **Public functions are thin.** Shape:

  ```ts
  export const markDone = mutation({
    args: { blockId: v.id("blocks") },
    handler: async (ctx, args) => {
      const userId = await requireUser(ctx);
      return await Blocks.markDone(ctx, userId, args.blockId);
    },
  });
  ```

- `requireUser(ctx)` throws `ConvexError({ code: "UNAUTHENTICATED" })` when there is no
  session. Every model function that loads a document by id checks `doc.userId === userId`
  and throws `NOT_FOUND` otherwise.
- Queries use indexes with explicit ranges. A day is `by_userId_and_date` with `eq(userId)` and
  `eq(date)`; a range uses `gte`/`lte` on `date`. Ranges are capped (e.g. 62 days).
- Internal work (cron handlers, push) uses `internalMutation` / `internalAction` and is
  never exposed publicly.
- Actions do not touch the database directly; they call internal queries and mutations.
- After `npx convex ai-files install`, follow `convex/_generated/ai/guidelines.md` where
  it is more specific than this section.

## 8. Client conventions

- **Server state** comes only from Convex `useQuery`. No copy of it in a client store.
- **URL state**: the viewed date and the selected block id are route and search params.
- **Local UI state**: React state inside the feature. Add a small store only when two
  distant features truly share ephemeral state.
- **Device preferences** live in `localStorage`, not in Convex: so far only the theme
  (`src/lib/theme.ts`, key `intent-theme`), so the PC can be dark while the phone
  follows its system. `index.html` applies it before the first paint with a copy of
  the same logic.
- **Mutations** that the user feels (status taps, drags, quick add) use optimistic
  updates built from the `shared/` functions, so the UI responds instantly.
- **Feature structure**: `features/day/DayScreen.tsx` (container: queries, mutations,
  wiring) and presentational components that take props. Presentational components are
  easy to test and to preview.
- **Errors**: a mutation failure shows a toast with a mapped message and rolls back. A
  route-level error boundary catches render errors and offers a reload. Error codes live
  in `shared/errors.ts`; `src/lib/errors.ts` reads the code from a failed call.
- **Signed-in screens** are children of the `_app` layout route. It renders them only
  while there is a session (`useConvexAuth`), so a screen's queries never run signed
  out, and it sends a signed-out visit to `/signin?redirect=<where it was headed>`.
- **First visit**: the `_app` layout calls `setup.ensure` with the device's time zone on
  every signed-in visit (`useEnsureSetup`). The first time it creates the settings row
  and seeds the default categories; after that it changes nothing. It runs from the
  client, not from a sign-up hook, because only the device knows its time zone, and so
  that accounts created before M1 get set up too. Until it has run, `settings.get`
  returns null and screens wait.
- **Backend imports** in `src/` go through `src/lib/api.ts`, which re-exports `api` and
  the `Doc` and `Id` types from `convex/_generated/`.

## 9. Notifications

**Subscribe (per device).** In Settings, "Enable notifications on this device" requests
permission, calls `pushManager.subscribe` with the VAPID public key, and saves the
subscription through a mutation (upsert by `endpoint`).

**Dispatch.** A cron runs an internal mutation every minute:

1. For each user's settings, compute the local `{ date, minute }` from `timeZone`.
2. Load today's blocks (`by_userId_and_date`). Select blocks with status `planned`, a plan start
   in `(minute − 3, minute]`, no `notifiedAt`, and whose activity has `notify` on.
3. Set `notifiedAt` on them (inside the mutation, so a block is never sent twice).
4. Ten-minutes-left (U3): select blocks that are still `planned`, whose activity has
   `pressure` on, with a planned duration of 30 minutes or more, whose plan end minus 10
   falls in `(minute − 3, minute]`, and with no `endingNotifiedAt`. Set it. Include
   yesterday's blocks that cross midnight.
5. Check the morning and evening nudge times the same way, using
   `lastMorningNudgeDate` / `lastEveningNudgeDate` as the once-per-day guard.
6. Schedule the Node action `push.send` with the prepared payloads.

**Send.** `push.send` (`"use node"`) loads the user's subscriptions through an internal
query, sends each payload with `web-push`, and deletes subscriptions that answer 404 or
410.

**Receive.** The service worker's `push` handler calls `showNotification(title, { body,
tag, data: { url } })`. `tag` is the block id so a duplicate would replace, not stack.
`notificationclick` focuses an open window or opens `data.url`.

Payload for a block: title = `"Gym · push day"`, body = the effective why (falling back
to the how, then to the time range). Ten-minutes-left: title = `"10 minutes left"`,
body = `"Done when: …"` (falling back to the block title). The anti-vision and
cost-of-skipping texts are never put in a notification. Evening nudge: "Close the day" / "Review today and
plan tomorrow". Morning nudge: "Today" / the day's main focus.

A minute-level poll was chosen over scheduling one job per block because it has no
schedule to keep in sync when blocks move: the plan in the database is the only truth.
Cost is about 44,000 small function calls a month, far inside the free allowance.

## 10. Recurrence

- A `recurrences` row is a rule: weekdays, start time, duration, start and end dates,
  and the plan every occurrence gets (title, activity, category, focus). Intent
  overrides and done-when are not on the rule: an occurrence inherits its activity's,
  and an override written on one occurrence belongs to that block only.
- A rule is made from a block ("Repeat…" in block detail, `recurrences.repeat`): the
  rule takes the block's plan as saved, starts on the block's date, and the block
  becomes its first occurrence (`recurrenceId` set). Only a plain block on today or
  later can start one.
- Rules are **materialised into ordinary blocks** for a rolling window by a daily cron,
  and on demand when a later date is opened. The window ends at UTC today + 15 days:
  every zone's today + 14 fits in it, so the cron needs no time zone (Filip's
  decision). Making or changing a rule materialises its window at once.
- The daily job is `crons.ts` at 02:17 UTC, `recurrences.materializeAll`: every rule
  in pages of 25, each page scheduling the next, never filling a date before UTC
  yesterday. Opening a date the window has not reached calls
  `recurrences.materializeThrough` from the day and plan screens
  (`useEnsureMaterialized`, which first asks `needsMaterializing` on the loaded rules,
  so a normal visit sends nothing). On demand reaches at most a year past UTC today.
- `materializedThrough` is the last date handled. Materialisation only ever creates
  dates after it, then moves it on, so an occurrence deleted by hand stays deleted:
  no tombstone is needed (Filip's decision). Run twice, it creates nothing new; it
  also skips a date that already holds a block of the rule.
- An occurrence that would overlap a block already in the plan lane is not created,
  and the block there never moves (Filip's decision). Making or changing a rule
  reports the dates it left out in its first window, and the screen says so in one
  line; dates the daily run reaches later are left out quietly.
- The lane is read once per chunk of up to 60 days (`listBetween`) and occurrences are
  placed with `planOccurrences` (`shared/recurrence.ts`, over `placeSpans` in
  `shared/lanes.ts`), so the inserts of one run see each other and the occurrences of
  rules handled before them.
- A block whose plan is changed by hand is marked `detached` (`blocks.update` does it
  whenever the title, activity, category, focus, date, start or length of an
  occurrence changes; marking, actual times, the note and intent never do). Rule
  changes never regenerate or delete it. Skipping one occurrence is just status
  `skipped`, or deleting the block.
- **"This and following"** (`recurrences.changeFrom`, from an occurrence on date S):
  from the rule's first date the rule itself is rewritten; from a later one the rule
  ends at S − 1 and a new rule carries on from S, so past days keep the plan they had.
  The occurrences from S on that are still `planned` and not detached are deleted and
  made anew (one deleted by hand may come back, Filip's decision); the marked and
  detached ones stay and move to the rule that now covers them, so no date gets a
  second block. The block it was made from takes the new plan and follows the rule
  again, unless only the weekdays or the end changed and it was moved by hand.
- **Deleting "this and following"** (`recurrences.endFrom`): the rule ends at S − 1
  (it is kept, ended, so the blocks that stay still point at it); S's block goes, and
  so do the later occurrences still to do. A rule that no longer reaches a block's
  date leaves a plain block, which may start a rule of its own.
- `shared/recurrence.ts` answers "which dates does this rule produce between A and B"
  (`ruleDates`, `datesToMaterialize`) and "which of them become blocks"
  (`planOccurrences`).

## 11. Offline and PWA

- The service worker precaches the app shell, so the app opens without a connection.
  It is hand-written (`src/sw.ts`, vite-plugin-pwa `injectManifest`) and exists only in
  production builds; `npm run preview` serves one locally. Every in-app address is
  answered with the cached `index.html`. Of the fonts only the Latin subsets are
  precached.
- Updates: a new version installs in the background, takes over at once and reloads the
  page a single time (`registerType: "autoUpdate"`). If a reload ever interrupts typing,
  switch to a "new version ready" prompt.
- `lib/offlineSnapshot.ts` writes the latest result of today's queries (blocks,
  activities, categories, day record) to `localStorage` whenever they change.
- When the Convex client is not connected, the day screen renders the snapshot read-only
  with the offline banner (S4). On reconnect, live data replaces it.
- No offline writes in v1. Controls are disabled rather than queued, so nothing is lost
  silently.
- Manifest: name, short name, theme colours for both themes, maskable icons, `display:
  standalone`, start URL `/`.

## 12. Auth and security

- Convex Auth with the password provider. Sign-up is accepted only for emails in the
  `ALLOWED_EMAILS` environment variable (comma-separated); everyone else is rejected
  server-side, in the provider's `profile` hook in `convex/auth.ts`, before anything is
  stored. An unset or empty list allows nobody. Emails are trimmed and lower-cased, so
  one address is one account whatever its case. A new password needs at least 10
  characters. `convex/auth.test.ts` drives the real sign-in action to hold all of this.
- A failed sign-in never says which part was wrong. Convex Auth also rate-limits failed
  attempts per account.
- Environment variables are declared in `convex/convex.config.ts` and read as the typed
  `env` from `convex/_generated/server`, not from `process.env`.
- Every document has `userId`; every read and write is checked against the session user.
  The app is single-user, but the code is written as if it were not.
- Secrets live in Convex environment variables: `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`,
  `VAPID_SUBJECT`, `ALLOWED_EMAILS`, and the keys Convex Auth generates. The only
  frontend variables are `VITE_CONVEX_URL` and `VITE_VAPID_PUBLIC_KEY`. No secret is
  ever prefixed `VITE_`. `.env.local` is git-ignored.
- User text is rendered as text, never as HTML.
- Convex Auth is labelled beta by Convex. If it blocks progress, the fallback is Clerk,
  which only changes `requireUser` and the sign-in screen.

## 13. Testing

| Level | Tool | What |
| --- | --- | --- |
| Unit | Vitest | Everything in `shared/`. This is the bulk of the tests: midnight crossings, overlaps, default actual times, gaps, summaries, recurrence dates, grid math. Table-driven. |
| Backend | convex-test | Model invariants (rejects overlap, rejects foreign documents, status transitions), the dispatcher (sends once, respects toggles), materialisation is idempotent. |
| Component | Testing Library | A few: block card states, now panel fallbacks, review step logic. |
| End to end | Playwright (M6) | One smoke path: sign in, create a block, mark it done, see it in the actual lane. `e2e/smoke.spec.ts`, run with `npm run e2e` on the PC against the dev deployment (it starts `npm run dev`, or uses one already running), as the dev test account from `.env.example` (`E2E_EMAIL`, `E2E_PASSWORD` override it). It works on a random day in 2001–2020 and deletes its block. Not part of `npm run check` or CI: both run without a backend. The first run needs `npx playwright install chromium`. |

Rule: a bug in time or lane logic gets a failing unit test first, then the fix.

## 14. Environments and deployment

- **Dev:** `npm run dev` runs Vite and `convex dev` against the personal cloud dev
  deployment named in `.env.local` (see the table below). Until 2026-10-14 development
  ran on a local deployment on this PC; that one is no longer used.
- **Prod:** Convex production deployment + Vercel project. Vercel's build command is
  `npx convex deploy --cmd 'npm run build'` with `CONVEX_DEPLOY_KEY` set, so backend and
  frontend deploy together from `main`; other branches are not built (`ignoreCommand`). The command, the fallback of every address to
  `index.html` and the no-cache rule for `sw.js` are in `vercel.json`.
- **CI:** a GitHub Actions workflow (`.github/workflows/check.yml`) runs `npm ci`,
  `npm run check` and a production build on every push.
- **Backups:** Convex dashboard export on demand; JSON export from the app in M9.

### Environments

As set up on 2026-10-14. Secrets are never written here.

| What | Where | Settings |
| --- | --- | --- |
| Code | github.com/masavik5-a11y/intent (private), branch `main` | CI: `.github/workflows/check.yml` |
| Convex project | team `masavik`, project `intent`, region eu-west-1. Dashboard: https://dashboard.convex.dev/t/masavik/intent | |
| Convex dev | deployment `befitting-trout-81`, selected in `.env.local` with `npx convex deployment select befitting-trout-81` | `SITE_URL=http://localhost:5173`, `JWT_PRIVATE_KEY`, `JWKS`, `ALLOWED_EMAILS` = the dev test address from `.env.example` and Filip's address |
| Convex prod | deployment `diligent-hawk-428` (`--prod` in CLI commands) | `SITE_URL=https://intent-asda-3b4a.vercel.app`, `JWT_PRIVATE_KEY`, `JWKS`, `ALLOWED_EMAILS` = Filip's address |
| Frontend | Vercel project imported from the repository; live since 2026-10-14 at https://intent-asda-3b4a.vercel.app | `CONVEX_DEPLOY_KEY` = the production deploy key (`prod:`). Deployment Protection (Vercel Authentication) must be **off** for production, see below |

Vercel's Deployment Protection ("Vercel Authentication") must not cover the production
address. With it on, every file redirects to a vercel.com sign-in; the browser fetches the
web app manifest and the service worker without that sign-in, so the phone cannot install
the app and the worker cannot update. It protects nothing worth protecting: the bundle
holds no secrets, and the data sits behind the app's own sign-in in Convex.

The Convex CLI on this PC is logged in, so commands reach both deployments without a
deploy key. Check which deployment a command targets before running it; production
changes need Filip's say-so.

### Cloud sessions (Claude Code on the web)

Work can also run in a Claude Code cloud session (claude.ai/code, the Claude app, or
**Cloud** in the desktop app) on `masavik5-a11y/intent`. The session's VM clones GitHub,
so only pushed work is there.

- **Setup is in the repository.** The SessionStart hook in `.claude/settings.json` runs
  `scripts/cloud-session-start.sh`. On a cloud VM (`CLAUDE_CODE_REMOTE=true`) it installs
  Node 24 from nodejs.org (the VMs ship Node 22), checksum-verified, puts it first on
  `PATH` through `CLAUDE_ENV_FILE`, and runs `npm ci` whenever `package-lock.json`
  changed. Anywhere else it exits at once. The cloud environment needs no setup script,
  variables or secrets for this: the default **Trusted** network allows
  `registry.npmjs.org` and `nodejs.org`.
- **What works there:** `npm run check`, `npm run build`, git, pull requests (the Check
  workflow runs on them).
- **What does not:** the Convex CLI. There is no login, and `*.convex.cloud` is not on
  the Trusted allowlist, so no `npm run dev`, no pushing functions to the dev deployment
  and no `npx convex data`. There is no Browser pane either. convex-test covers the
  backend; checking the screens moves to Filip, after the merge or on a preview.
- **Screens without a backend:** the VM has headless Chromium and Playwright
  (`/opt/node-tools/node_modules/playwright`). A throwaway page that renders a
  feature's presentational components with mock documents, served by `npx vite` and
  screenshotted at 1280 and 390 px, catches layout mistakes before Filip sees them. Keep
  it out of the repository (an untracked folder listed in `.git/info/exclude`, deleted
  before `npm run check`, which would lint it). It does not replace the check on the
  live app.
- **Branches:** a cloud session pushes its own branch and opens a pull request. Filip
  merges; a merge to `main` is a production deploy (Vercel deploys the functions to
  `diligent-hawk-428`, then the site).
- **No previews:** Vercel builds `main` only. `ignoreCommand` in `vercel.json` skips
  every other branch (exit 0 means "skip"), because `CONVEX_DEPLOY_KEY` is set for
  Production only and a branch build would fail at `npx convex deploy`. On a pull
  request the Check workflow is the gate; the screens are checked on the live app after
  the merge. Per-PR previews with Convex preview deployments are possible later.
- **Files that stay on Filip's PC** and that a cloud session does not need: `.env.local`
  (which dev deployment the CLI uses), `.convex/` (the old local backend), and Claude's
  memory notes there, whose content is in section 17.

### First-time production setup

Done once, in this order. Steps marked (you) need a browser sign-in.

1. (you) Create an empty private repository on GitHub. Then
   `git remote add origin <url>` and `git push -u origin main`. The Check workflow runs.
2. (you) `npx convex login`. Then `npx convex dev --configure=new --dev-deployment cloud`
   creates the Convex project and moves development from the local deployment to a cloud
   one. (What actually happened: the project was created in the dashboard, and
   `npx convex deployment select <dev deployment name>` pointed `.env.local` at it.) Give that dev deployment its settings: `npx @convex-dev/auth` (keys and
   `SITE_URL=http://localhost:5173`) and
   `npx convex env set ALLOWED_EMAILS <your email>`.
3. (you) In the Convex dashboard, production deployment, Settings: generate a production
   deploy key.
4. (you) In Vercel, import the GitHub repository and add the environment variable
   `CONVEX_DEPLOY_KEY` (Production) with that key. Deploy. Note the site's URL.
5. Give the production deployment its settings:
   `npx @convex-dev/auth --prod --web-server-url <site URL>` and
   `npx convex env set ALLOWED_EMAILS <your email> --prod`.
6. (you) Open the site on the PC, choose "Create the account", then install it from the
   browser's address bar. On the phone open it in Chrome, sign in, "Install app".
7. Check that sign-up with any other email answers "Sign-up is closed for this address."

## 15. Verify first

Things assumed here that must be confirmed in the milestone that depends on them:

| Milestone | Check |
| --- | --- |
| M0 | `convex/` can import from `shared/` (bundling). **Confirmed 2026-10-13:** a Convex function importing `../shared/time` bundles and runs. `convex/` uses relative imports; `src/` uses the `@shared/*` alias. |
| M0 | Current scaffold command and template for Vite + Convex + Convex Auth; current TanStack Router and Tailwind v4 setup with Vite. **Confirmed 2026-10-13:** `npm create convex@latest <dir> -- -t react-vite-convexauth`; Tailwind v4 through `@tailwindcss/vite`; TanStack Router file-based routes through `@tanstack/router-plugin/vite` (the generated `src/routeTree.gen.ts` is committed). |
| M0 | How to restrict sign-up in Convex Auth's password provider (callback or profile hook). **Confirmed 2026-10-13:** the provider's `profile` hook runs on every flow before any account is read or written; throwing there on `flow === "signUp"` stores nothing. See section 12. |
| M4 | `Intl.DateTimeFormat` with a `timeZone` works in Convex's default runtime. If not, do the conversion in the Node action or store the device's UTC offset. |
| M4 | Minute-interval crons are allowed on the free plan and their real cost in function calls. |
| M4 | Web Push delivery on the actual Android phone with the PWA installed and battery optimisation on; and on desktop with the browser closed. |
| M4 | The Convex client API for connection state (for the offline banner). |

## 16. Decision log

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-13 | Web app (PWA), not native. | One codebase for PC and Android; desktop is primary. |
| 2026-10-13 | Convex over Supabase and Dexie Cloud. | Notifications are required, offline is not; least code for sync + scheduling. |
| 2026-10-13 | Floating local time, minutes from midnight, no stored timestamps. | A planner is about wall-clock time; avoids time-zone and daylight-saving bugs. |
| 2026-10-13 | One `blocks` table holding plan and actual. | One-to-one in almost every case; simpler than two linked tables. A block interrupted and resumed is logged as two entries. |
| 2026-10-13 | No overlaps within a lane. | One thing at a time is the product's premise; also makes layout and stats simple. |
| 2026-10-13 | Recurring blocks are materialised, not virtual. | Every occurrence is a plain block: no exception tables, simple queries. |
| 2026-10-13 | Notification dispatch by minute poll. | No per-block schedules to keep in sync when plans change. |
| 2026-10-13 | No offline writes. | Stated need is read-only; avoids conflict handling entirely. |
| 2026-10-13 | Custom time grid, no calendar library. | Two lanes, compressed sleep and the visual style do not fit off-the-shelf calendars. |
| 2026-10-13 | Pressure is a per-activity flag, not global. | Countdown and ten-minutes-left help deep work and harm sleep, meditation and rest. |
| 2026-10-13 | Weekly targets live on categories, in minutes. | "Deep work 15h" spans several activities; one number per category keeps pace readable. |
| 2026-10-13 | Countdown, pace and days-left are computed, never stored. | They are functions of blocks and the clock; storing them would only create stale data. |
| 2026-10-13 | Vision and anti-vision are plain user text in one `compass` row; shown only on request. | They are personal writing, not settings, and must never be pushed at the user. |
| 2026-10-13 | Sign-up allow-list enforced in the Password provider's `profile` hook; a new password needs 10 characters. | Rejects before anything is stored; one public login guards personal writing. |
| 2026-10-13 | Phone bottom bar: Today, Week, quick add, Insights, More. | The other four screens need a way in on the phone (DESIGN.md section 2). |
| 2026-10-13 | A new app version reloads the page once by itself (`autoUpdate`). | Simplest; switch to a prompt if a reload ever interrupts typing. |
| 2026-10-14 | Index names list every field: `by_userId`, `by_userId_and_date`. | Convex's guidelines (`convex/_generated/ai/guidelines.md`) require it; the draft schema above was renamed before any table exists. |
| 2026-10-14 | Wake and sleep times live in `settings` (`wakeMin`, `sleepMin`). | First-run setup asks for them, and the grid's Fit zoom needs the waking range. |
| 2026-10-14 | Date and colour-key fields are typed in the schema (`vDateKey`, `vColorKey`). | The brand reaches every document and argument; the model validates the value. |
| 2026-10-14 | Between midnight and the grid's start, "Today" is still the day that is ending (Filip's choice). | The grid runs 05:00 to 05:00, so only that day shows the now line after midnight. |
| 2026-10-14 | Vercel builds `main` only; pull requests get no preview (Filip's choice). | Cloud sessions work through pull requests; previews would need their own Convex deployments. The Check workflow gates a PR; screens are checked after the merge. |
| 2026-10-14 | An actual start may run to 2880 (the end of the next day); a plan start stays below 1440. | A block planned at 23:30 can begin at 00:10. Keeping every span of a block dated D inside D and D+1 keeps the three-day read window. |
| 2026-10-14 | Skip reasons are a fixed union in the schema, not free text. | PRD A1 lists five; a typed value can be counted in insights (R4, R7). Free words go in the note. |
| 2026-10-14 | Done on a running block ends it now; Done after an overrun keeps the planned end (Filip's choice). | Nothing is recorded in the future, and a late start never pushes into the next block. PRD section 7, rule 5. |
| 2026-10-14 | `blocks.setStatus` takes the device's local day and minute as `now`. | Done ends a running block "now", and the device's clock is the one on screen; the optimistic update uses the same value, so screen and server agree. The server never needs the time zone for this. |
| 2026-10-14 | The running block's growing bar is exactly what Done would record at that minute. | One rule (`freeStretch` in `shared/lanes.ts`) for the bar, the totals and the tap, so they never disagree. |
| 2026-10-15 | M3 started before M2's "Done when" (Filip's choice): M2 is merged and live, its real day runs in parallel. | Daily use starts with M3; waiting would cost a week for nothing. |
| 2026-10-15 | The evening review is a mode of the day screen, in the URL as `?review=<step>`; steps replace each other in history. A block, quick add or logging opened from it keeps `review` in the URL, so closing them returns to the review. | The grid stays visible and editable beside it (DESIGN.md section 2), and the back gesture closes it in one step. |
| 2026-10-15 | Resolve asks about the blocks that begin in the day's grid, are still "planned" and have begun. A tail from the day before belongs to that day's review; a block still ahead tonight is not asked about. | One block, one review. Nothing that has not happened is asked for. |
| 2026-10-15 | Fill gaps offers Drift and the rest category at once (found by "rest" in an intentional category's name, so "Rest on purpose"), "Leave it", and behind "Something else" every category and the activities. A gap labelled with an activity is an entry linked to it (`blocks.logEntry` takes `activityId`). | PRD section 5 names an activity, rest and drift. Eight colour chips per gap was too much on the phone. |
| 2026-10-15 | The now panel offers the review from whichever comes first, the end of the day's last planned block or two hours before the sleep time, until the day is reviewed (Filip's decision). R and today's "Review the day" always open it; a past day not reviewed shows a quiet "Review the day" link above the grid, so the phone can reach it too. | The review must be cheap to start every evening and never nag. |
| 2026-10-15 | "Copy from a date" copies the plan lane only (times, title, activity, category, focus, done-when and the other overrides) as plain blocks still to do; blocks a rule made are left out, a block that would overlap is skipped and listed, nothing already there moves (Filip's decision). It takes the source day's grid as shown, so a block after midnight lands after midnight (`shared/planning.ts`, `placeSpans` in `shared/lanes.ts`). | Copying is a starting point; what happened that day is not part of a plan. |
| 2026-10-15 | Planning ahead is its own screen, `/plan/<date>`, the plan lane at full width with the main focus above it, not a mode of the day view. A day that is over redirects to its day view. Block detail is one container, `BlockPanel`, shared by both screens. | The day view's other lane, totals and now panel are noise while planning; one detail panel keeps the edit rules in one place. |
| 2026-10-15 | The main focus saves by itself a second after typing stops, on leaving the field and on Enter, like the compass. The review's last step has the next day's focus field too. | Writing the focus is the one thing planning always needs; it should cost no extra screen. |
| 2026-10-15 | A rule holds the plan (title, activity, category, focus, start, length); intent overrides and done-when stay on each block. A rule is made from a saved block on today or later, which becomes its first occurrence; with unsaved plan edits "Repeat" waits for Save. | The why lives on the activity; done-when is usually written per day. A rule made from what is on screen but not saved would surprise. |
| 2026-10-15 | Materialisation: window through UTC today + 15; only dates after `materializedThrough`; no tombstone; an overlapping occurrence is not made and the block there stays (Filip's decisions). Making a rule reports the dates its first window left out; later ones are left out quietly. | The cron needs no zone; a deleted occurrence stays deleted; nothing the user placed moves. |
| 2026-10-15 | The daily job runs at 02:17 UTC over all rules in pages of 25; opening a later date materialises on demand, at most a year past UTC today. An ended rule is not written again. | A page per run stays inside a mutation's limits however many rules there are; the cap keeps a stray URL from writing years of blocks. |
| 2026-10-15 | Editing a repeating block (Filip's decision, built so): changing the plan of an occurrence still ahead, or deleting it, asks "This one" (it detaches) or "This and following"; marking, actual times, the note and intent never ask or detach; an occurrence that has started or is past changes only itself. A detached occurrence edits like a plain block. Repeat settings on an occurrence ("Change", "Stop after this one") apply from its date and need it to be today or later. When "This and following" leaves dates out, the panel stays open to say so. | Every one-off change stays one tap away from the default, and nothing that happened is ever rewritten by a rule. |
| 2026-10-15 | "This and following" from a later date splits the rule (old one ends the day before, a new one starts); from the first date it rewrites the rule. Deleting ends the rule rather than removing its document. | Past occurrences keep the rule they were made by, and every block that stays can still say where it came from. |
| 2026-10-15 | "Welcome back. Plan today?" shows on today when the last day with anything recorded (a status, a logged entry or a review) is two or more days back, read newest first through `by_userId_and_date` over the last 14 days (`days.returning`; `isReturning` in `shared/days.ts`). With nothing in those 14 days it shows if anything is dated before today, so a first day is not a return. "Not now" lasts the day on that device (`localStorage`). A guard test reads the M3 screens' words for missed, streak, failed, wasted (`voiceGuard.test.ts`). | Filip's decision; the look-back stays bounded and indexed, and a lapse is met with today, not with a count. |
| 2026-10-15 | The reflection saves on Next; `reviewedAt` is set by "Close the day" or "Plan tomorrow". Opening the review again shows the saved answers and closing it again updates `reviewedAt`. "Plan tomorrow" is offered only when the next day is today or later. | Leaving halfway keeps what was typed but does not count as reviewed. Planning a day that is over makes no sense. |
| 2026-10-16 | M4 (notifications and offline) moves after M7, before M8 (Filip's choice). M5, M6 and M7 are built in one pull request with the milestone gate lifted; M2's and M3's real days run in parallel. Nothing in M5–M7 depends on M4: the notification side of the V4 guard, the offline snapshot and M4's "Verify first" rows stay with M4. | Filip wants pace, speed and the wider views before notifications. |
| 2026-10-16 | Hours invested in a goal = actual minutes recorded on the blocks of the activities linked to it, dated from the goal's `createdOn` (the device's day it was made) on. Read per linked activity through a new blocks index `by_activityId_and_date`, at most 4,000 blocks per goal (`capped` says when the read stopped). Unmarked running time is not counted (a query does not read the clock). Unlinking an activity takes its hours with it. | Bounded and indexed without a stored counter (pace and hours are computed, never stored). Counting from the goal's own day keeps years of an activity's past out of a new goal. 4,000 blocks is years of daily blocks for one person. |
| 2026-10-16 | Goals are never deleted: they are marked done or dropped, and can be reopened. Their activities stay linked. | PRD U6 and the roadmap ask for done or dropped; with no delete there is never a dangling `goalId`. |
| 2026-10-16 | Pace (`shared/pace.ts`): the week is seven day grids from the first weekday's grid start, so a night's sleep counts in the week its grid belongs to. Days left = 7 − completed days, so today counts as left until its review is closed. The difference from expected is rounded to 5 minutes and within that reads "on pace"; at or over the target it reads "target reached" instead of ahead; when behind it adds the minutes a day still needed, rounded up to 5 ("2h 40m a day"); a reviewed last day reads "week closed". Progress is written `9h 20m of 15h`, not `9 of 15h`. | PRD pace rules 1 to 3, with the grid as the day everywhere else in the app. Rounding keeps a 2-minute wobble from flipping ahead and behind; minutes in the progress make the line match a hand count. |
| 2026-10-16 | Compass, below the two texts: goals (soonest due first, undated after; Edit, Mark done, Drop; done and dropped folded under "Done and dropped" with Reopen; the form is a dialog, a bottom sheet on the phone) and weekly targets per category, typed in hours ("15", "7.5", or "7h 30m"), saved on leaving the field or Enter, empty clears. Drift and archived categories take no target. | DESIGN.md section 7 lists what each goal shows; a target for drift would turn drift into something to reach. Hours are how Filip thinks of a week ("Deep work 15h"). |
| 2026-10-16 | An activity's goal is chosen in its form as chips ("No goal" and each open goal; a closed goal it already points at stays offered). The now panel's goal chip (a flag, "Launch the course · 36 days left") sits under the why, also on the phone's folded card, only for an open goal, with days counted from the app's today (the grid day). | The chip is the deadline beside the why (DESIGN.md section 4a, item 5); a done or dropped goal has no finish line left to push against. |
| 2026-10-16 | The pace line sits in the now panel under the day totals, headed "This week", for the running block's category when it has a target; on the phone it is behind "More". The week's blocks come from `blocks.listRange` (any range up to 62 days, the day before the week to the day after), computed on the device so the running block counts to the minute. | DESIGN.md section 4a, item 9; the phone's folded card keeps to the block itself. One bounded range query serves pace now and the week and month views in M7. |
| 2026-10-16 | Dragging (PRD T9; `shared/drag.ts`, `src/features/day/blockDrag.ts`): a plan card moves or resizes (bottom edge) while its block is still ahead on today or a day to come, or on a past day after "Edit plan"; on today it starts no earlier than now. A block that has started does not move in the plan lane; its actual card does (done, partly done, unplanned entries), ending no later than now and never over the running block's growing bar. The running bar and cards cut at the grid's edge (sleep across 05:00) do not drag; block detail changes them. A plan with recorded actual times keeps its calendar day. A drop that would collide slides back toward where it came from until it fits (it may jump past a block into free time beyond); nothing else ever moves. | PRD section 7, rules 4 and 6: the future is edited as plan, what has started as what happened, and nothing overlaps. Sliding back instead of refusing keeps the drop useful. |
| 2026-10-16 | A drag on a repeating occurrence changes that one only and detaches it ("This one"), without asking; "This and following" stays in block detail. | A drag is a direct change to one block on one day; asking after every drop would cost the speed drag is for. |
| 2026-10-16 | Drag on the phone starts with a 450 ms long press on a card; a touch that moves 8 px before that is a scroll. A mouse drags after 4 px; less is a click that opens the block. Esc cancels a drag. A drop shows at once (optimistic `blocks.update`, `src/lib/blockUpdate.ts`) and a refusal is said above the grid or in the open panel. | DESIGN.md section 11 keeps the time fields in block detail as the non-drag way; the long press keeps scrolling the phone's grid as it was. |
| 2026-10-16 | Shortcuts (DESIGN.md section 8) come from one table, `src/features/shortcuts/shortcuts.ts`. T and ? work on every screen (the `?` overlay is mounted in the app shell); the day view adds ←/→, N, L, ↑/↓, Enter, D, P, S, U, X, R. ↑/↓ move the keyboard focus between cards (top to bottom, plan before actual), so the selection is the focus ring and Enter opens it as a click; with nothing selected, ↓ starts at the block running now. D, P, S act on the selected card's block, else the current block, else the one waiting to be marked, and only on a block not marked yet; U on a marked block, else the one marked last from the now panel. P opens the block's detail with Partly's lengths showing (`?partly=true`). All keys rest while typing or while a dialog or sheet is open. | The keys already built in M1–M3 (N, L, X, R) were missing T, ←/→, ↑/↓, Enter, D, P, S, U and ?. Focus as selection needs no second highlight and keeps Enter and screen readers native; refusing D/S on a marked block stops one key from erasing what happened. |
| 2026-10-16 | Zoom (DESIGN.md section 3): Fit, Comfortable (1.25 px/min) and Detailed (2 px/min) on the desktop, chosen in the grid's lane header and kept per device in `localStorage` (`intent-zoom`, like the theme); the phone keeps 1.5 px/min. Changing it scrolls now (or the wake time) back into view. | Zoom is about the screen in front of you, not about the data; the header is where the grid is. |
| 2026-10-16 | Compressed sleep: plan-lane blocks in a category named "Sleep" (any case) are folds of the grid's time axis, drawn 40 px tall in both lanes, when at least 3 hours and when that makes them shorter. Every minute↔pixel step (cards, hour marks, now line, untracked hatch, clicks, drag) goes through one piecewise scale, `GridScale` in `shared/grid.ts` (`minuteToPx`, `pxToMinute`, `scaledBox`); a click inside a fold lands proportionally inside it, hour marks inside a fold are not drawn. Renaming the Sleep category turns it off. | The category is found by name, as pressure finds "Deep work" and the review finds "Rest"; one scale keeps clicks and drags matching what is drawn. |
| 2026-10-16 | Motion (DESIGN.md section 6) only answers a change made while the screen is open: the check of a block just marked done or partly settles in, a card new to the actual lane slides in, the side panel slides in when it opens and the now panel when it comes back, the now line glides to the next minute, cards cross-fade colour. Nothing moves when a day opens. Three keyframes in `src/styles/theme.css` (`animate-settle`, `animate-enter-lane`, `animate-panel`, 150–200 ms, ease-out); with reduced motion each is a plain fade and the now line jumps. | Design goal 5: calm, with the now line, the countdown and untracked time the only things that move on their own; an animation on every load would be noise. |
| 2026-10-16 | Quick add, logging an entry, block detail's Save and Delete, and drops close at once and show the change optimistically; a refusal (rare: overlaps are named before saving) rolls the change back and is said above the grid or in the now panel. "This and following", "Repeat" and "Copy from a date" still wait for the server, which reports the dates or blocks it left out. | ARCHITECTURE.md section 8: what the user feels responds at once. The waiting flows have an answer to show, so they keep their panel open for it. |
| 2026-10-16 | The phone's now card folds to one line ("One line" under the card; DESIGN.md section 2): a dot, "Edit · 1h 40m left" (or "Lunch ended at 13:00", "Free until 17:00"), and Done for the running or just-ended block, so marking stays one tap. Tapping the line unfolds it. Kept per device in `localStorage` (`intent-now-card`). Tap targets under 44 px found by an audit of the phone screens (header icon links 38 px wide, the goal list's Edit) are now 44 px. | With the card open the grid had about a quarter of the phone's height; folded, it gets most of it, and the why is one tap away. |
| 2026-10-16 | Accessibility pass (DESIGN.md section 11), checked with axe-core in the screenshot harness on every main screen, dialog, sheet and review step, light and dark: a done block is muted by a lighter fill (`bg-key-tint/60`) instead of fading the whole card, which had pulled its text under AA; a running block's time is no longer faded on the solid fill; quick add's activity options are the pressed element themselves (a button inside a `role=option` was a control inside a control); the zoom is a group of pressed-state buttons. Tab order: nav rail, header, zoom, plan lane, actual lane, now panel, each with a visible ring. | Text on cards must stay AA in both themes; axe found these and nothing else. |
| 2026-10-16 | The Playwright smoke test runs on the PC as `npm run e2e` against the Convex dev deployment, outside `npm run check` and CI. `@playwright/test` is pinned at 1.63.0, the newest release more than two weeks old (1.64.0 and 1.64.1 came out in the last ten days). It did not run against a real backend in the cloud session that wrote it (no Convex access, and no Convex CLI there); its steps were run against the screenshot harness's fixture backend, sign-in left out. | A cloud session and CI have no backend; the smoke path needs a real one. A release with two weeks behind it is the safer pin. |

## 17. Implementation notes

Things learned while building that are easy to get wrong. Add to this list when you hit
one; delete an entry when it stops being true.

**Convex**

- Read `convex/_generated/ai/guidelines.md` before writing Convex code. Current API
  shapes: `ctx.db.get("users", id)`, `ctx.db.patch("blocks", id, fields)`,
  `ctx.db.replace(table, id, doc)` (the table name comes first).
- Environment variables are declared in `convex/convex.config.ts` and read through the
  typed `env` from `./_generated/server`. Set them with `npx convex env set`
  (add `--prod` for production).
- `ConvexError` data must be a `type` alias, not an `interface` (see `AppErrorData` in
  `shared/errors.ts`). Throw app errors with `appError(code)` from
  `convex/lib/errors.ts`; add new codes to `shared/errors.ts`.
- Tests: `convex/test.helpers.ts` has `newTest()`, `signedIn(t)` (a user row and a
  caller signed in as it) and `expectAppError(call, code)`. Underneath, a signed-in
  caller is `t.withIdentity({ subject: userId + "|session" })`: Convex Auth reads the
  user id from the part before `|`. `convex/auth.test.ts` shows how to drive the real
  sign-in action. Files with two dots (`x.test.ts`, `test.helpers.ts`) are never pushed
  to Convex.
- `npx convex data <table>` lists a table on the dev deployment: the quickest way to
  check what a mutation wrote while verifying a slice. To call a signed-in function
  on dev from the shell, pass an identity:
  `npx convex run blocks:listForDay '{"date":"2026-10-14"}' --identity '{"subject":"<userId>|x"}'`.
  Never add `--prod` to that without Filip's say-so.
- Model write helpers build documents field by field and leave unset fields out; in a
  `patch`, a field set to `undefined` is removed. Update arguments use "left out keeps,
  `null` clears" for optional text (`clearableText` in `convex/blocks.ts`).
- On this PC the Convex CLI often ends with
  `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` and exit code 127 after it has
  succeeded. Read its output, not its exit code.
- Date fields use `vDateKey` (`v.string() as VString<DateKey>`) and colour keys
  `vColorKey`, both exported from `convex/schema.ts`, so documents and arguments carry
  the branded types. The cast checks nothing at run time: a model function that writes
  one validates it first (`isDateKey`, `isColorKey`). Decided 2026-10-14.
- In a cloud session there is no `npx convex dev` to regenerate
  `convex/_generated/api.d.ts`. A new module under `convex/` needs its two lines there
  (the import and the `fullApi` entry) by hand, in the generated order; `api.js` is a
  proxy and needs nothing. Vercel's `npx convex deploy` regenerates the file anyway.

**Frontend**

- shadcn/ui here is the "nova" preset on Base UI, not Radix. Composition uses the
  `render` prop, not `asChild`. A link that looks like a button is
  `<Link className={buttonVariants()}>`; `<Button render={<Link />}>` gives the link
  `role="button"`.
- Add primitives with `npx shadcn@4.21.4 add <name>`. Files in `src/components/ui` stay
  exactly as generated (Prettier ignores them, a lint rule is relaxed for them). If the
  CLI asks to overwrite an existing primitive, it is safe to pass `--overwrite`.
- TanStack Router: route files only export `Route`. `src/routeTree.gen.ts` is generated
  by the Vite plugin while `npm run dev` or a build runs, and is committed; after adding a
  route file, run one of them before `npm run typecheck`. Redirect in `beforeLoad` with
  `throw redirect(...)`. Never render `<Navigate>` with a `search` object built during
  render: it navigates again on every re-render and loops (see `src/routes/_app.tsx` and
  `signInSearchFor` in `src/features/auth/redirect.ts`).
- `/day/$date` validates the date in `beforeLoad` and hands it to the screen as a
  `DateKey` through route context: `Route.useRouteContext().date`.
- The clock is read only in `src/lib/now.ts` (`readNow`, and `useNow()`, one shared
  minute ticker that also catches up when the app returns to the foreground); ESLint
  rejects `Date.now()` and `new Date()` anywhere else in `src/` and in `shared/`.
- `/` is `src/routes/_app/index.tsx`: it waits for the settings, because which day is
  today depends on the grid's start, then redirects to `/day/<today>`, or to
  `/welcome` (first-run setup) while `settings.setupCompletedAt` is unset. `/?add=now`
  (the phone's +) lands on the day and then opens quick add as its own history entry.
- Logging an unplanned entry is `?log=now` or `?log=<grid position>`, like quick add.
  An entry is stored on the calendar day it began (`blocks.logEntry`), with its start
  below 1440, like a plan start.
- Quick add is `?add=now` or `?add=<grid position>` on `/day/$date`. TanStack Router
  writes a string that looks like a number with quotes (`?add=%22930%22`), so keep
  such values numbers in `validateSearch`.
- The browser's `type="time"` field follows its locale and can show AM/PM; the app is
  24-hour, so times are typed in `src/components/TimeInput.tsx`.
- A file named like a component next to a module of the same name in another case
  (`QuickAdd.tsx` and `quickAdd.ts`) is one file to Windows and breaks `tsc`. Name pure
  modules differently (`quickAddRules.ts`).
- Editing a file in two steps while Vite runs can leave the browser holding the
  in-between module under a `?t=` address, even across reloads. `touch` the file to
  make Vite serve it fresh.
- Signed-in screens render only while there is a session, so their queries may call
  `requireUser` freely. Import the backend API from `@/lib/api`.
- A sheet opened from the URL (not from its trigger) gets Base UI's default focus, the
  first field, which pops up the phone's keyboard. Pass `initialFocus` a ref to the
  sheet's title (`tabIndex={-1}`) when the sheet shows something rather than asks for
  typing; see `ActivitiesScreen`. Closing such a sheet goes back in history when it
  can (`useCanGoBack`), so the Android back gesture and Cancel agree.
- The side panel (`src/components/SidePanel.tsx`) holds block detail, entry detail and
  "Not feeling it": 340 px beside the grid from 1024 px, where it replaces the now
  panel, and a full sheet below that.
- The compass is queried only inside `NotFeelingIt`, which mounts only when it is
  opened, so the anti-vision is never loaded for the Today screen (PRD V4).
- A sheet's generated close button is 28 px. Pass `showCloseButton={false}` and put
  `<SheetCloseButton />` last in the content (44 px on the phone; last, so a form's
  first field still gets the initial focus).
- A `MediaQueryList` that nothing references can be garbage collected with its change
  listener: keep it in a variable (`systemScheme` in `src/lib/theme.ts`).
- While the Claude window is behind another one, the Browser pane draws no frames:
  screenshots time out, clicks can be dropped, animations stop at their start state
  and media-query change events do not fire. Read the DOM instead, or ask Filip to
  bring the window forward.
- Shared form pieces in `src/components/`: `DurationInput` (typed or preset lengths,
  snapped to 5 minutes), `TimeInput` (24-hour), `CategoryPicker`, `Field` and `AppIcon`
  (an icon by its stored name). Save failures read through `saveErrorMessage` in
  `src/lib/errorMessages.ts`; an overlap is named before saving with `collidingBlock`
  and `overlapMessage` in `src/lib/blockOverlap.ts`.
- Quick add, logging, block detail's Save and Delete, and a drag close at once with
  an optimistic update (`src/lib/blockUpdate.ts`: `createLocally`, `logLocally`,
  `updateLocally`, `removeLocally`, applied to every loaded `listForDay` and
  `listRange`). A new block carries a stand-in id (`pending-1`) until the server's
  answer replaces it. A refusal after closing is said by the screen
  (`onSaveError`), above the grid or in the now panel. "This and following" and
  "Copy from a date" still wait for the server, which says what it left out.
- Status changes are optimistic: `useSetStatus` in `src/lib/blockStatus.ts` runs the
  shared `applyStatus` on every loaded `blocks.listForDay` (`setStatusLocally`), and
  Convex rolls it back if the server refuses. Errors come back as a message, shown by
  the container (`DayScreen`), because the button that was pressed is usually gone by
  then (the block stopped being current).
- `StatusActions` sits inside block detail's `<form>`, so it must not render a form of
  its own (nested forms are invalid); its typed length saves on Enter by handling
  `keydown` instead.
- Colour: an element takes a category colour with `data-color={colorKey}` and the
  utilities `bg-key-tint`, `text-key-ink`, `bg-key-solid`, `text-on-solid` (DESIGN.md
  section 5). The voice font is `font-voice`.
- Vitest has three projects: `shared` (Node), `app` (Node, for `src/`) and `convex`
  (edge-runtime). Vitest blanks CSS imports unless they are listed in `css.include`.
  Components that only need to be rendered, not clicked, are tested with
  `renderToStaticMarkup` from `react-dom/server` in the Node project (see
  `todayGuard.test.tsx`, the V4 guard); a test that clicks needs jsdom (a new
  dependency) and the `app` project switched to it. `src/` has no Node types: read
  source files in a test with `import.meta.glob(..., { query: "?raw" })`.

- Screens checked in a cloud session (section 14) can run the whole router with fixture
  data: a throwaway Vite config that aliases `convex/react`, `@convex-dev/auth/react`
  and `virtual:pwa-register` to small mocks (a `useQuery` that answers by function
  name, read from `Symbol.for("functionName")` on the reference). Playwright's
  `page.clock.setFixedTime` and `timezoneId` pin the app's "now".

- Dragging on a touch screen: once a long press has turned into a drag, the grid's
  scroller cancels `touchmove` through a listener added with `{ passive: false }`
  (React's are passive), or the page scrolls under the finger and Chrome sends
  `pointercancel`. In the screenshot harness, Playwright's touchscreen only taps; real
  touch drags go through CDP, `Input.dispatchTouchEvent` (touchStart, touchMove,
  touchEnd), which Chrome turns into pointer events.

- Accessibility in the screenshot harness: `npm install axe-core` into a folder in the
  scratchpad (not the repository), inject `axe.min.js` with `page.addScriptTag` and
  run `axe.run(document)`; it reads contrast against the real themes. Opacity on a
  card's text is what fails it most: mute the fill instead.

- In a cloud session, `pkill -f "<pattern>"` also matches the shell that runs it (its
  command line holds the pattern) and kills the tool call. Write the pattern so it
  cannot match itself: `pkill -f "[v]ite --config"`.

**Tooling on this PC**

- The Bash tool is Git Bash and keeps its working directory between calls: use absolute
  paths. Setting `TZ` there does not reach Node; use PowerShell (`$env:TZ = "..."`) to
  run tests in another time zone. The machine itself is set to Central Europe (Node
  resolves it as Europe/Budapest).
- npm warns that esbuild's install script is not approved. Everything works without it.
- Check `npm run check`'s own exit code before committing; a pipe such as `| tail` hides
  a failure.
- The Browser pane is about 375 px wide. `resize_window` with the mobile preset gives
  sharp phone screenshots; a desktop size (1280×800) is scaled down, so its screenshots
  are coarse and clicks by `ref` can land in the wrong place. Under emulation, fill text
  with `form_input` and click by coordinates from a fresh screenshot.
- Verifying in the running app uses the Claude desktop app's Browser pane, which keeps
  its own sign-ins. It is signed in to the dev deployment as the dev test account from
  `.env.example`. Filip signs it in himself when needed: the password travels to
  convex.cloud, not to localhost, so Claude does not type it.
