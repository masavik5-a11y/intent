# Intent — personal day planner

"Intent" is a working name. A single-user web app (installable PWA) for planning a day in
time blocks, where every block carries its *why* and *how*, and where what was planned is
always shown next to what actually happened. Built for one person (Filip), not for sale.
Desktop is the primary device; an Android phone is the companion.

## Read before working

| Doc | Read it when |
| --- | --- |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Always. It says which milestone is current and what "done" means. |
| [docs/PRD.md](docs/PRD.md) | Before building or changing any feature. Requirement IDs (T1, R2…) live here. |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Before touching data model, Convex functions, time math, notifications. |
| [docs/DESIGN.md](docs/DESIGN.md) | Before building or changing any UI. |
| [docs/PRINCIPLES.md](docs/PRINCIPLES.md) | When a product decision is unclear. It explains why features exist. |

Work on one milestone at a time, in the order given. Do not build ahead.

## Stack

- Vite + React + TypeScript (strict), Tailwind CSS v4, shadcn/ui, TanStack Router
- Convex: database, realtime sync, server functions, cron, auth (Convex Auth, password)
- PWA via vite-plugin-pwa (`injectManifest`, custom service worker), Web Push for notifications
- Vitest + convex-test for tests, ESLint (typescript-eslint + Convex plugin) + Prettier
- Hosting: Vercel (frontend), Convex cloud (backend)

Use the latest stable versions at scaffold time and pin them. Library APIs move: check
current docs (and `convex/_generated/ai/guidelines.md` once it exists) before using
Convex, Convex Auth, TanStack Router or vite-plugin-pwa APIs. Do not write them from memory.

## Commands

Keep this section in sync with `package.json`.

```bash
npm run dev        # `convex dev` and the Vite dev server together (http://localhost:5173)
npm run check      # typecheck + lint + tests. Must pass before any task is called done.
npm run typecheck  # tsc for src/, shared/, the Vite config, and convex/
npm run lint       # eslint, then prettier --check
npm run format     # prettier --write
npm run test       # vitest run (npm run test:watch to watch)
npm run build      # typecheck, then the production build
```

`tsc` is the native TypeScript 7 compiler (`@typescript/native`). The `typescript`
package is pinned to TypeScript 6 because typescript-eslint does not support 7 yet.

## Repository layout

```
shared/     Pure domain logic (time math, overlap, day summary, recurrence). No React, no Convex imports.
convex/     Schema, public functions (thin), model/ (business rules), crons, push action.
src/        React app: routes/, features/<feature>/, components/ui/ (shadcn), lib/.
docs/       Product and technical docs. Update them when a decision changes.
```

## Rules that keep this from becoming a mess

1. **Domain logic is pure and tested.** Anything involving minutes, dates, overlap, plan
   versus actual, recurrence or statistics goes in `shared/` as pure functions with unit
   tests. Components and Convex functions call these; they do not reimplement them.
2. **One time model.** A block belongs to a local calendar day (`date: "YYYY-MM-DD"`) and
   stores minutes from that day's local midnight. No `Date` objects or UTC timestamps for
   block times. See ARCHITECTURE.md, "Time model".
3. **Plan and actual are separate fields and never overwrite each other.** The past is
   edited as actual, the future is edited as plan. See PRD.md, "Plan versus actual rules".
4. **All writes to a table go through its model module** (`convex/model/<table>.ts`),
   which enforces invariants. Public Convex functions are thin: validate args, get the
   user, call the model.
5. **Every public Convex function** has argument validators, calls `requireUser(ctx)`, and
   checks that documents belong to that user. Use indexes; never `.collect()` an unbounded
   table and never `.filter()` where an index fits.
6. **Feature folders.** UI for a feature lives in `src/features/<feature>/`. Shared
   primitives live in `src/components/ui/`. No data fetching inside presentational
   components; a feature's container or hook owns its queries and mutations.
7. **No new dependency without a reason** written in the commit or PR. Prefer what is
   already installed. No calendar or scheduler UI library; the time grid is ours.
8. **TypeScript stays strict.** No `any`, no `@ts-ignore`, no non-null `!` without a
   one-line comment saying why it is safe.
9. **Add tables and fields only in the milestone that needs them.**
10. **Small vertical slices.** One user-visible behaviour at a time, with its tests, then
    `npm run check`, then verify it in the running app (desktop width and phone width)
    before saying it works.

## Product guardrails

- Single user. No sharing, teams, meetings, calendar integrations, or AI features unless
  the PRD is changed first.
- The app's voice never shames. Unplanned low-value time is "drift", never "wasted" or
  "failed". A skipped block is information, not a verdict. See DESIGN.md, "Voice".
- Urgency comes from finish lines and time running out (done-when, countdown, weekly
  pace, days left), never from guilt, comparison with other people, or punishing streaks.
- The anti-vision and "cost of skipping" texts are the user's own words. They are shown
  only when the user asks ("Not feeling it"), never in notifications or automatic
  messages, and the app never writes such text itself.
- Speed of the daily loop beats features: marking a block takes one tap, the evening
  review takes under three minutes, planning tomorrow takes under two.
- UI language is English.

## Working agreements

- At the start of a session, read ROADMAP.md, state which slice you are doing, then do it.
- When a slice is finished and verified, tick its checkbox in ROADMAP.md and commit it:
  one local commit per slice. Never push unless asked.
- If a requirement is ambiguous or a doc contradicts the code, stop and ask rather than
  guessing. If a decision changes, update the doc in the same change.
- ROADMAP.md lists "Verify first" risks per milestone. Check those before building on them.

<!-- `npx convex ai-files install` (milestone M0) adds a managed Convex section below
     this line. Do not edit inside its markers; rerun the command to refresh it. -->

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
