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
- All minutes are multiples of 5. Durations are `[5, 1440]`.
- Block times are **floating local time**. A block at 15:00 is at 15:00 wherever the user
  is. No UTC timestamps are stored for block times, and none are derived and stored.
- `Date` objects are created only at the edges: reading "now" in the UI (`useNow`), and
  in the notification dispatcher. Everything in between works on `DateKey` and minutes.
- "Now" in the UI comes from one hook, `useNow()`, which ticks once a minute and returns
  `{ date: DateKey, minute: number }`. Components never call `new Date()` themselves.
- The server needs the user's zone only to answer "what is the local date and minute
  right now?" for notifications. It uses `settings.timeZone` (IANA name, saved from the
  device) with `Intl.DateTimeFormat(..., { timeZone }).formatToParts(now)`.
- A day view for date D loads blocks with `date = D` and `date = D − 1` (for tails that
  cross midnight). Week and month views load a date range through the same index.

`shared/time.ts` exposes the only functions allowed to parse or format these values:
`parseDateKey`, `toDateKey`, `addDays`, `minutesToLabel`, `isValidMinute`, and so on.

## 5. Data model

Draft Convex schema. Tables marked with a milestone are added in that milestone.

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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
    // M4
    notifyBlockStart: v.optional(v.boolean()),
    notifyEndingSoon: v.optional(v.boolean()),
    morningNudgeMin: v.optional(v.number()),
    eveningNudgeMin: v.optional(v.number()),
    lastMorningNudgeDate: v.optional(v.string()),
    lastEveningNudgeDate: v.optional(v.string()),
    // M9
    birthDate: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // M1: one row per user. The vision and anti-vision texts.
  compass: defineTable({
    userId: v.id("users"),
    vision: v.optional(v.string()),
    antiVision: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  // M1
  categories: defineTable({
    userId: v.id("users"),
    name: v.string(),
    kind: categoryKind,
    colorKey: v.string(),
    icon: v.string(),
    sortOrder: v.number(),
    archived: v.boolean(),
    weeklyTargetMin: v.optional(v.number()), // M5
  }).index("by_user", ["userId"]),

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
  }).index("by_user", ["userId"]),

  // M1 (plan fields), M2 (status and actual fields)
  blocks: defineTable({
    userId: v.id("users"),
    date: v.string(), // DateKey
    title: v.string(),
    focus: v.optional(v.string()),
    activityId: v.optional(v.id("activities")),
    categoryId: v.id("categories"),

    plannedStartMin: v.optional(v.number()),
    plannedDurationMin: v.optional(v.number()),

    status: blockStatus,
    actualStartMin: v.optional(v.number()),
    actualDurationMin: v.optional(v.number()),
    skipReason: v.optional(v.string()),
    note: v.optional(v.string()),
    minimumChosen: v.optional(v.boolean()), // "Start the minimum" was used (PRD V3)

    ...intentFields, // per-block overrides; unset means "inherit from the activity"

    recurrenceId: v.optional(v.id("recurrences")), // M3
    detached: v.optional(v.boolean()), // M3: edited by hand, leave it alone
    notifiedAt: v.optional(v.number()), // M4: start notification sent
    endingNotifiedAt: v.optional(v.number()), // M4: ten-minutes-left sent
  }).index("by_user_date", ["userId", "date"]),

  // M3
  days: defineTable({
    userId: v.id("users"),
    date: v.string(),
    mainFocus: v.optional(v.string()),
    wentWell: v.optional(v.string()),
    drifted: v.optional(v.string()),
    changeTomorrow: v.optional(v.string()),
    rating: v.optional(v.number()),
    energy: v.optional(v.number()),
    reviewedAt: v.optional(v.number()),
  }).index("by_user_date", ["userId", "date"]),

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
    startDate: v.string(),
    endDate: v.optional(v.string()),
    materializedThrough: v.optional(v.string()),
  }).index("by_user", ["userId"]),

  // M4
  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    deviceLabel: v.string(),
    lastSeenAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_endpoint", ["endpoint"]),

  // M5
  goals: defineTable({
    userId: v.id("users"),
    title: v.string(),
    why: v.optional(v.string()),
    dueDate: v.optional(v.string()), // DateKey
    status: v.union(v.literal("active"), v.literal("done"), v.literal("dropped")),
    sortOrder: v.number(),
  }).index("by_user", ["userId"]),

  // M7: inboxItems. Designed when that milestone starts.
});
```

### Invariants (enforced in `convex/model/blocks.ts`, tested)

1. A block has plan times, actual times, or both. Never neither. Start and duration are
   set or unset together.
2. `planned` and `skipped` blocks have no actual times. `done` and `partial` blocks have
   actual times.
3. An unplanned entry has no plan times and status `done`.
4. Minutes are integers, multiples of 5, within the ranges in section 4.
5. No two blocks of the same user overlap within the plan lane, and none within the
   actual lane, taking midnight-crossing tails from the previous day into account.
6. `date` is a valid `DateKey`. `categoryId` and `activityId` belong to the same user.
7. `title` is 1–80 characters after trimming; text fields are capped (e.g. 500).

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
| `defaultActual(block, laneBefore)` | Actual times when marking Done: the plan, with the start pushed past the previous actual entry (rule 5). |
| `findOverlap(candidate, lane)` | The block that a candidate would collide with, or none. |
| `untrackedGaps(actualLane, from, to, minLen)` | Stretches not covered by any actual entry. |
| `summarizeDay(blocks, categories, now)` | Minutes on purpose, drift, maintenance, untracked; planned versus actual per activity. |
| `applyStatus(block, action)` | The field changes for Done, Partly, Skip, Undo. |
| `countdown(block, now)` | Minutes left, fraction remaining, minutes over. Drives the draining bar. |
| `weeklyPace(targetMin, actualMin, completedDays, daysLeft)` | Progress, ahead or behind against expected, minutes per remaining day (PRD "Pace rules"). |
| `daysLeft(dueDate, today)` | Calendar days to a goal's due date; negative when over. |

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
- Queries use indexes with explicit ranges. A day is `by_user_date` with `eq(userId)` and
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
- **Mutations** that the user feels (status taps, drags, quick add) use optimistic
  updates built from the `shared/` functions, so the UI responds instantly.
- **Feature structure**: `features/day/DayScreen.tsx` (container: queries, mutations,
  wiring) and presentational components that take props. Presentational components are
  easy to test and to preview.
- **Errors**: a mutation failure shows a toast with a mapped message and rolls back. A
  route-level error boundary catches render errors and offers a reload.

## 9. Notifications

**Subscribe (per device).** In Settings, "Enable notifications on this device" requests
permission, calls `pushManager.subscribe` with the VAPID public key, and saves the
subscription through a mutation (upsert by `endpoint`).

**Dispatch.** A cron runs an internal mutation every minute:

1. For each user's settings, compute the local `{ date, minute }` from `timeZone`.
2. Load today's blocks (`by_user_date`). Select blocks with status `planned`, a plan start
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

- A `recurrences` row is a rule: weekdays, start time, duration, start and end dates.
- Rules are **materialised into ordinary blocks** for a rolling window (today + 14 days)
  by a daily cron, and on demand when a later date is opened.
- Materialisation is idempotent: for a given rule and date it creates a block only if
  none exists with that `recurrenceId` and `date`.
- A block edited by hand is marked `detached` and is never regenerated or deleted by rule
  changes. Skipping one occurrence is just status `skipped` (or deleting the block; a
  deleted occurrence is remembered by a `detached` tombstone if needed, decide in M3).
- Editing a rule ("this and following") updates the rule, deletes future non-detached
  `planned` blocks of that rule, and materialises again.
- `shared/recurrence.ts` answers "which dates does this rule produce between A and B".

## 11. Offline and PWA

- The service worker precaches the app shell, so the app opens without a connection.
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
  `ALLOWED_EMAILS` environment variable; everyone else is rejected server-side.
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
| End to end | Playwright (M6) | One smoke path: sign in, create a block, mark it done, see it in the actual lane. |

Rule: a bug in time or lane logic gets a failing unit test first, then the fix.

## 14. Environments and deployment

- **Dev:** `npm run dev` runs Vite and `convex dev` against a personal dev deployment.
- **Prod:** Convex production deployment + Vercel project. Vercel's build command is
  `npx convex deploy --cmd 'npm run build'` with `CONVEX_DEPLOY_KEY` set, so backend and
  frontend deploy together from `main`.
- **CI:** a GitHub Actions workflow runs `npm ci` and `npm run check` on every push.
- **Backups:** Convex dashboard export on demand; JSON export from the app in M9.

## 15. Verify first

Things assumed here that must be confirmed in the milestone that depends on them:

| Milestone | Check |
| --- | --- |
| M0 | `convex/` can import from `shared/` (bundling). **Confirmed 2026-10-13:** a Convex function importing `../shared/time` bundles and runs. `convex/` uses relative imports; `src/` uses the `@shared/*` alias. |
| M0 | Current scaffold command and template for Vite + Convex + Convex Auth; current TanStack Router and Tailwind v4 setup with Vite. |
| M0 | How to restrict sign-up in Convex Auth's password provider (callback or profile hook). |
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
