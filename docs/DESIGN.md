# Design — Intent

How the app looks, is laid out, and behaves. Requirement IDs refer to [PRD.md](PRD.md).

## 1. Design goals

1. **Alive, not administrative.** Colour, icons, a moving now line, a satisfying check-off.
   This is the reason the app exists instead of a calendar.
2. **Today first.** The app opens on today. Everything else is one step away.
3. **The why is visible without a click** for the current block.
4. **Plan next to actual, always.** Never hidden behind a tab or a report.
5. **Calm, with pressure where you chose it.** One accent action per screen, generous
   spacing, no badges, no red counters. The only things that move on their own are the
   now line, the countdown of a pressure block, and untracked time growing.

## 2. Layout

### Desktop (primary, ≥ 1024 px)

```
┌────┬──────────────────────────────────────────────┬───────────────────────┐
│ ☀  │  ‹  Today · Tue 13 Oct  ›      Plan tomorrow │ ● Now · 42 min left   │
│ ▦  │       Plan              Actual               │ ████████░░░░░░░░░░░░  │
│ ▤  │  7 ┌──────────────┐ ┌──────────────┐         │ Deep work · script    │
│ ▥  │    │ Routine      │ │ Routine      │         │ Done when: draft,     │
│ ◎  │  8 ├──────────────┤ │              │         │ 300 words             │
│ ⚑  │    │ Deep work 1  │ ├──────────────┤         │                       │
│    │  9 │ Script reel  │ │ Deep work 1  │         │ Why                   │
│    │    │              │ │ ░░ untracked │         │ One reel a week…      │
│    │ 10 │              │ │ ░░ (growing) │         │ Launch · 38 days left │
│    │ ───│──────────────│─│──────────────│── now   │ How / If-then …       │
│    │ 11 ├──────────────┤ │              │         │ [Done][Partly][Skip]  │
│    │    │ Gym          │ │              │         │                       │
│    │ 12 └──────────────┘ └──────────────┘         │ On purpose   Drift    │
│    │    …                                         │ 3h 20m       45m      │
│ ⚙  │                                              │ Deep work 9 of 15h    │
│    │                                              │ 3 days left · −1h 30m │
└────┴──────────────────────────────────────────────┴───────────────────────┘
 nav   day grid (flexible)                            side panel (340 px)
 rail
```

- **Nav rail** (56 px): Today, Week, Month, Insights, Activities, Compass, and Settings
  at the bottom. Icons with tooltips; the current view is highlighted.
- **Day grid** (flexible width): header with date navigation and one primary action;
  below it the two-lane hour grid.
- **Side panel** (340 px) has three modes:
  - *Now* (default on today): current block, countdown, finish line, intent, goal and
    days left, actions, day totals, weekly pace, up next. See section 4a.
  - *Block detail*: opens when a block is selected; all fields editable; Esc returns to Now.
  - *Review*: the evening flow, step by step, while the grid stays visible and editable.

### Tablet and narrow desktop (640–1023 px)

Nav rail stays. The side panel becomes a sheet that slides over the grid from the right.
The now panel is the exception: below 1024 px it is the phone's now card above the grid,
so it never covers the plan (decided 2026-10-14 while building it).

### Phone (< 640 px)

```
┌─────────────────────────────┐
│ Tue 13 Oct            ‹  ›  │
│ ● Now · 42 min left         │
│ Gym · push day              │
│ Why: Energy for the camera… │
│ [ Done ] [ Partly ] [ Skip ]│  ← now card, collapsible to one line
├─────────────────────────────┤
│     Plan          Actual    │
│ 11 ┌───────────┐ ┌────────┐ │
│    │ Gym       │ │ Gym    │ │  ← plan lane 60 %, actual lane 40 %
│ 12 └───────────┘ └────────┘ │
│    …                        │
├─────────────────────────────┤
│  Today   Week   +   Insights│  ← bottom bar, + is quick add
└─────────────────────────────┘
```

Block detail and the review open as full-height sheets. Tap targets are at least 44 px.

The bottom bar holds Today, Week, quick add (from M1) and Insights, plus **More**, which
opens a bottom sheet with the screens that have no room on the bar: Month, Activities,
Compass, Settings. (Decided 2026-10-13 while building the shell: the sketch above left
those four unreachable on a phone. Change it here if daily use suggests another split.)

## 3. The time grid

| Aspect | Spec |
| --- | --- |
| Range | From `gridStartMin` (default 05:00) for 24 hours, so a normal day reads top to bottom and sleep sits at the bottom. Between midnight and that start, "Today" is still the day that is ending, so the now line stays on screen. |
| Zoom | Desktop default is **Fit**: the waking part of the day fits the viewport without scrolling. Also Comfortable (1.25 px/min) and Detailed (2 px/min). Phone uses 1.5 px/min and scrolls. |
| Sleep | Long sleep blocks are drawn compressed (fixed 40 px) so they do not eat the screen. |
| Lanes | Plan and Actual, equal width on desktop. A thin gutter between them. |
| Snap | 5 minutes when dragging, 15 minutes when clicking an empty slot. |
| Now line | 1 px line with a dot, across both lanes, today only. Moves every minute. |
| Untracked | Before now, empty actual-lane time is shown as a faint diagonal hatch. |
| Future | The actual lane after now is empty and slightly dimmed. |
| Short blocks | Under 20 px tall: coloured bar only, title on hover or tap. |
| Across midnight | A block running past the grid's end is cut there with a flat bottom edge and shows its whole range ("23:30–07:00"); its tail opens the next day's grid with a flat top edge and reads "until 07:00". Screen readers hear "continues into Sat 17 Oct" or "continues from Fri 16 Oct". |
| Hour lines | Hairlines on the hour, labels every hour on desktop, every two on phone. |

All geometry (minutes to pixels, snapping, compressing sleep) comes from pure functions
in `shared/`, so it is tested and identical everywhere.

## 4. Block appearance

A block is a rounded rectangle in its category colour with an icon, the title, the focus
line if there is room, and the time range.

| State | Plan lane | Actual lane |
| --- | --- | --- |
| Planned, future | Tinted fill, normal text | — |
| Current | Solid fill, white text, subtle pulse on the icon | Growing solid bar from the start to the now line |
| Done | Tinted fill, check icon, slightly muted | Tinted fill at actual times |
| Partly | Tinted fill, half-check icon | Tinted fill at actual times, label "1h 45m of 3h" |
| Skipped | Outline only, struck-through title | Nothing |
| Unplanned | — | Tinted fill with a small "+" marker |
| Drift | — | Drift colour, label "Drift · phone" |

Never rely on colour alone: every state also has an icon or a text label.

## 4a. The now panel and urgency

Order, top to bottom. Items appear only when they have content.

1. **Status line**: "Now · 42 min left".
2. **Countdown bar** (pressure blocks only): a full-width bar in the block's solid colour
   that drains from right to left over the block's planned time. In the last ten minutes
   the minutes-left text becomes medium weight. No colour change, no blinking. When time
   is up the bar is empty and the line reads "Time's up · 5 min over".
3. **Title and focus**: "Deep work · script the reel".
4. **Done when**: the finish line, in primary text, directly under the title. It is the
   thing the countdown pushes against, so it sits closest to it.
5. **Why**, in the serif voice. Under it, if the activity has a goal: a quiet chip,
   "Launch the course · 38 days left".
6. **How**, **If I don't feel like it**, **Minimum version**.
7. **Actions**: Done, Partly, Skip. Below them a quiet text link: "Not feeling it".
8. **Day totals**: on purpose, drift, untracked. Updated every minute.
9. **Weekly pace** for the current block's category, if it has a target:
   "Deep work 9 of 15h · 3 days left · behind by 1h 30m". Plain text, normal colour.
10. **Up next**: the following two blocks.

Built in M1: items 1–6 (without the goal chip) and 10. The actions and "Not feeling it"
arrive in M2, the totals in M2, the pace and the goal chip in M5. On the phone the card
shows the status, bar, title, done when and the why in two lines; "More" opens the rest.

Blocks without pressure (sleep, meditation, rest, meals) show item 1 as text only, and no
bar. Between blocks the panel shows "Free until 14:00", the next block, the totals, and a
"Log what I'm doing" action; the untracked counter keeps running.

In the actual lane, untracked time is drawn as a hatch that extends with the now line,
so drifting is visible while it is happening.

Time perspective (year bar, life in weeks) and comparison with last week appear only in
the weekly review, never here.

## 4b. The "Not feeling it" view

Opened from the now panel (or `X`). It replaces the side panel on desktop and is a
full-height sheet on phone. One calm column, read top to bottom, each part only if it
has text:

```
Gym · push day                      11:00–12:30

If I don't feel like it
  Then I do 10 minutes and decide.

The minimum that still counts
  20 minutes, three exercises.          [ Start the minimum ]

If I keep skipping this
  Low energy, and it shows on camera.

The life I refuse to drift into
  (your anti-vision, serif, full text)

The life I'm building
  (your vision, serif, full text)

[ Start ]   [ Start the minimum ]   [ Skip on purpose ]
```

- The order is deliberate: the easiest way forward first, the hard look in the middle,
  the vision last, then the choice.
- Anti-vision and vision use the serif voice at a comfortable reading size. No red, no
  warning icons, no imagery of failure. It is your text on a quiet surface.
- "Skip on purpose" asks for the usual optional reason and is recorded like any skip. It
  is a legitimate choice and the button is not styled as a lesser one.
- If the compass is empty, this view shows the if-then and minimum only, plus one line:
  "Write your compass" linking to the Compass screen.

## 5. Categories and colour

Seeded on first run. All are editable.

| Category | Kind | Colour key | Icon (lucide) | Typical activities |
| --- | --- | --- | --- | --- |
| Deep work | intentional | violet | brain | Scripting, editing, writing |
| Body | intentional | teal | dumbbell | Gym, run, walk |
| Mind | intentional | coral | flower-2 | Meditation, journaling, reading |
| Rest on purpose | intentional | pink | coffee | Free time, a film, friends |
| Events | intentional | amber | party-popper | Wedding, trip, family |
| Life | maintenance | gray | house | Meals, chores, errands, routine |
| Sleep | maintenance | slate | moon | Sleep, wind down |
| Drift | drift | red | cloud | Scrolling, unplanned low-value time |

The list lives in `shared/categories.ts` (`DEFAULT_CATEGORIES`). Icons are lucide names
from the short set in `shared/icons.ts`; "home" is called `house` there.

Each colour key defines three tokens for light and for dark theme: `tint` (block fill),
`ink` (text on the tint), `solid` (current block, icons). Tokens are CSS variables defined
once in the theme file; components use the key, never a hex value. Every `ink` on `tint`
pair must meet WCAG AA contrast in both themes.

In code (`src/styles/theme.css`): an element takes a key with `data-color="violet"` and
uses the utilities `bg-key-tint`, `text-key-ink`, `bg-key-solid`, `text-key-solid` and
`text-on-solid` (white text on a solid). `src/styles/theme.test.ts` checks, for every key
in both themes, that ink on tint and white on solid reach 4.5:1 and that the solid reaches
3:1 against its tint and the page. A colour change that breaks this fails `npm run check`.

## 6. Typography, shape, motion

- **Type.** One sans family for the interface. The **why** text is set in a serif face,
  slightly larger: it should read like your own voice, not like a form field. The faces
  are Geist (interface, `font-sans`) and Source Serif 4 (voice, `font-voice`), both
  self-hosted so the installed app looks the same on PC and phone and works offline.
- **Scale.** 12 / 13 / 14 / 16 / 20 / 28 px. Two weights: regular and medium. In Tailwind
  these are `text-xs`, `text-sm`, `text-base` (the interface default), `text-lg` (the why),
  `text-xl` and `text-2xl`; no other size exists. `font-semibold` and `font-bold` resolve
  to medium.
- **Shape.** 8 px radius on blocks and controls (`rounded-block`), 14 px on panels and
  sheets (`rounded-panel`).
- **Motion.** 150–200 ms, ease-out. Used for: check-off (the block settles and a check
  draws in), a block appearing in the actual lane, panel mode changes, the now line.
  Respect `prefers-reduced-motion`: replace movement with a fade.
- **Sound and haptics.** None.

## 7. Screens

| Screen | Purpose | Notes |
| --- | --- | --- |
| **Today / Day** | The main screen. `/day/2026-10-13`; `/` redirects to today. | Section 2. |
| **Block detail** | Edit everything about a block. | Fields: activity, title, focus, done when, start, duration, category, repeat, intent fields (showing inherited text greyed until overridden), status, actual times, note. Opens from a block card (`?block=<id>`): the 340 px side panel from 1024 px, a sheet below that. An inherited field shows the activity's text greyed with "From Gym"; typing makes it this block's own, and "Use Gym's" hands it back. Choosing an activity moves the block to the activity's category. Delete asks once. |
| **Quick add** | Create a block in a few keystrokes. | Activity picker with search, start time, duration. Enter saves. Opens from `N`, the + button, or clicking an empty slot (time prefilled). A dialog on desktop, a bottom sheet on phone. Typing part of a name and pressing Enter takes the first match and saves it; a title that matches nothing asks for a category. Without a click the start is suggested: the next 5-minute mark on today, the wake time on other days, moved to where the block's length fits. A time before the grid's start lands on the next calendar day, at the bottom. An overlap is named before saving ("That overlaps Lunch (12:00–13:00)."). Times are typed 24-hour ("930", "21:30"). |
| **Log unplanned** | Add an actual-lane entry. | Title, category chips (Drift first), start, duration. Defaults to "from the end of the last entry until now". |
| **Evening review** | Close the day (R1, R2). | Side panel on desktop, sheet on phone. Four steps with a progress indicator; each step can be skipped. Ends with "Day closed" and the totals. |
| **Plan tomorrow** | Set up the next day (P1). | Tomorrow's grid, plan lane only, recurring blocks already present. Actions: add block, copy from a date, main focus field. |
| **Activities** | The library (I1). | List grouped by category as tinted cards (icon, length, countdown mark, the why in serif); archived ones under "Archived" with Restore. The edit form opens in a sheet (from the right on desktop, full width on phone; `?activity=<id>` or `new` in the URL, so back closes it): name, category chips, icon, usual length, then "Intent" (why, how, done when) and "For hard days" (if-then, minimum, cost of skipping), the countdown (pressure) and notify switches, and from M5 a goal picker. |
| **Compass** | The big picture (V1, U5, U6). | Top: two wide text areas side by side, "The life I'm building" and "The life I refuse to drift into", with writing prompts while empty and the date last edited. Stacked on the phone, vision first. Both are in the serif voice and save by themselves a second after typing stops and on leaving the field ("Saved"); a change from another device appears unless you are editing that text. Below (from M5): goals as a short list (title, why, due date, days left, hours invested, sorted by due date) and the weekly target per category. |
| **Not feeling it** | Something to look at on a lazy day (V2). | Section 4b. |
| **Weekly review** | Close the week (R6, R8, R9). | Week numbers and pace per target, you versus last week, the skip check, three prompts and the obstacle question. At the end: the year bar, the optional life-in-weeks grid, and "Make week card" (R10). |
| **Week** | Seven days (P6). | Compact columns, same colours. Past days show both lanes as two thin columns. |
| **Month** | Find and add future events (P7). | Standard month calendar. Recurring blocks are hidden; other blocks show as coloured dots or short labels. |
| **Insights** | Looking back (R4). | A few plain charts, 7 and 30 day ranges. |
| **Settings** | Preferences. | Notification times and toggles, enable notifications on this device, theme, grid start, zoom, categories, sign out. The theme is "Like this device", Light or Dark, chosen per device (M1). |
| **Sign in** | One account. | Email and password. |

## 8. Keyboard (desktop)

| Key | Action |
| --- | --- |
| `T` | Go to today |
| `←` / `→` | Previous / next day |
| `N` | New block (quick add) |
| `L` | Log unplanned entry |
| `↑` / `↓` | Select previous / next block |
| `Enter` | Open selected block |
| `D` / `P` / `S` | Done / Partly / Skip on the selected block (the current block if none selected) |
| `U` | Undo status |
| `X` | Open "Not feeling it" for the current block |
| `R` | Start the evening review |
| `Esc` | Close panel or sheet |
| `?` | Show shortcuts |

Shortcuts are disabled while typing in a field.

## 9. Voice

The interface speaks plainly and never judges.

| Situation | Write | Don't write |
| --- | --- | --- |
| Unplanned low-value time | Drift | Wasted time, Lost time |
| A block not done | Skipped | Failed, Missed |
| Back after days away | Welcome back. Plan today? | You missed 4 days |
| Consistency | Reviewed 6 of the last 7 days | Streak: 0 |
| Many skips of one activity | Gym was skipped 3 times this week. Change something? | You keep skipping Gym |
| Empty day | Nothing planned yet. Start with one block. | No data |
| End of review | Day closed. 5h 10m on purpose, 50m drift. | Great job!!! |
| Behind on a weekly target | Deep work 9 of 15h · 3 days left · behind by 1h 30m | You're falling behind! |
| Block running out | 10 minutes left. Done when: script drafted, 300 words. | Hurry up! |
| Goal past its date | Launch the course · 3 days over | Overdue!, You missed your deadline |
| Comparison | By Tuesday last week: 2h deep work. This week: 1h 10m. | Others your age have… |
| Time perspective | Week 42 of 52 | You've wasted 41 weeks |
| Resistance | Not feeling it | Feeling lazy?, Don't give up! |
| Choosing the small version | Start the minimum | Just do the bare minimum |
| Choosing not to | Skip on purpose | Give up, Quit |

Sentence case everywhere. No exclamation marks. Buttons are verbs: "Plan tomorrow",
"Log it", "Close the day".

## 10. Empty, loading and error states

- **First run:** categories are seeded, and a short three-step setup asks for wake and
  sleep times and offers to create the first three activities with their why (and cost
  of skipping), then invites you to write the compass ("Write my compass" or "Later").
  Every step can be skipped, and so can the whole setup. The app opens on `/welcome`
  until it is finished or skipped, then on today.
- **Loading:** grid skeleton with hour lines; never a full-page spinner.
- **Offline:** a small banner, "Offline. Showing the last synced plan.", editing controls
  disabled.
- **Failed save:** the optimistic change is rolled back and a toast says what failed in
  one sentence with a Retry action.

## 11. Accessibility

- Full keyboard operation; visible focus ring on every interactive element.
- Blocks are buttons with an accessible name such as "Gym, push day, 11:00 to 12:30, done".
- Drag actions always have a non-drag alternative (the time fields in block detail).
- Text contrast AA in both themes; minimum text size 12 px.
- Respect reduced motion and the system font size.
