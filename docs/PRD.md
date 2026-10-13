# Product requirements — Intent

Status: draft v1, 2026-10-13. Owner: Filip. "Intent" is a working name.

## 1. Summary

A personal day planner that looks and feels like a visual timeline (in the spirit of the
app "Structured") with the honesty of a calendar grid. Four things make it different
from a normal calendar:

1. **Every block carries its intent**: what, why, how, and what to do when you don't feel
   like it. The why is on screen at the moment you need it.
2. **Plan and actual sit side by side, always.** You see the day you intended next to the
   day you lived, live, not in a report.
3. **The day closes with a short review that flows straight into planning tomorrow.**
4. **Finish lines create urgency.** A block can say what "done" looks like, its clock
   visibly drains, and weekly targets and dated goals show whether you are on pace.
   Pressure comes from time running out and from finish lines, never from guilt.

## 2. Who it is for

One person: an influencer with a lot of unstructured time and no meetings, who wants to
spend that time on purpose. The risk is not overload, it is drift: days that dissolve
without a decision having been made.

Devices: Windows PC (primary, used for planning, reviewing and during work) and an
Android phone (glance, tap done, receive notifications).

## 3. Problems to solve

| # | Problem | How the product answers it |
| --- | --- | --- |
| 1 | A regular calendar is dull, so it does not get opened. | Colourful timeline, a live "now" panel, satisfying check-offs, fast. |
| 2 | A bare label ("meditation") gives no reason to do it when tired or lost. | Why, how, if-then and minimum version on every block, shown on the now panel and in the notification. |
| 3 | No honest record of where time went. | Actual lane beside the plan lane, drift entries, evening fix-up, history and insights. |
| 4 | Planning feels like work, so it gets skipped. | Activities remember their why and how, recurring blocks, "plan tomorrow" in under two minutes. |
| 5 | Future commitments (a wedding) need a place. | Blocks on any future date, month overview. |
| 6 | Tools like this get abandoned after a few weeks. | See [PRINCIPLES.md](PRINCIPLES.md): low logging effort, data that pays back, no shame after a lapse. |
| 7 | Free time has no deadlines, so nothing feels urgent. | A "done when" finish line per block, a draining countdown, a ten-minutes-left warning, weekly pace against a target, goals with days left. |

## 4. Core concepts

| Term | Meaning |
| --- | --- |
| **Block** | A stretch of time on one day. Has a plan (start, duration), an outcome (status, actual start, actual duration), and intent fields. |
| **Activity** | A reusable definition such as "Deep work", "Gym", "Meditation". Holds the standing why, how, if-then, minimum version, default duration, category, icon. Blocks are created from activities and inherit their intent. |
| **Category** | A colour, an icon and a kind. Kinds: `intentional` (chosen, valuable, includes rest on purpose), `maintenance` (sleep, meals, chores), `drift` (unplanned low-value time). |
| **Plan lane / Actual lane** | The two columns of the day grid. Plan = what was intended. Actual = what happened. |
| **Unplanned entry** | A block that exists only in the actual lane. Used for drift and for good things that were not planned. |
| **Drift** | Time that went somewhere you did not choose. The product's word for "wasted time". |
| **Day record** | Per-date notes: tomorrow's main focus (written while planning) and the evening review. |
| **Compass** | One screen holding the big picture: your vision (the life you are building), your anti-vision (the life you refuse to drift into), and later your goals and weekly targets. |
| **Anti-vision** | A description, in your own words, of where you end up if you keep drifting. Written by you, about the future, shown only when you ask for it. |
| **Cost of skipping** | The anti-vision in miniature, per activity: "If I keep skipping this, in a year…". |
| **Finish line** | A block's "done when" line: the concrete result that ends it. Turns a block into a small deadline. |
| **Pressure** | A per-activity switch. When on, the block shows a draining countdown and sends a ten-minutes-left warning. On by default for deep work, off for sleep, meditation and rest. |
| **Weekly target** | Hours per week intended for a category ("Deep work: 15h"). Pace is measured against it. |
| **Goal** | Something with a why and, usually, a due date ("Launch the course, 21 Nov"). Activities can point at a goal, so their blocks show the days left. |

### Intent fields

| Field | Prompt shown to the user | Example |
| --- | --- | --- |
| Title | What | Gym |
| Focus | What exactly today | Push day |
| Done when | This block is done when… | All four lifts logged. (Deep work: "Script drafted, 300 words.") |
| Why | Why this matters to me | Energy for the camera. I keep promises to myself. |
| How | How I do it | Bench 4x6, incline, dips. Phone in the locker. |
| If-then | If I don't feel like it, then… | …I do 10 minutes and decide. |
| Minimum version | The smallest version that still counts | 20 minutes, three exercises. |
| Cost of skipping | If I keep skipping this, in a year… | Low energy, and it shows on camera. Still "starting on Monday". |

Why, how, if-then, minimum version and cost of skipping are written once on the activity. A block may
override any of them for that day only. "Done when" can have a default on the activity
but is usually written per block, while planning. Only the title is required.

## 5. The daily loop

**Morning (10 seconds).** Open the app (or tap the morning notification). Today is
already planned. The now panel shows the first block and the day's main focus.

**During the day.** When a block starts, a notification shows its title and why. The now
panel shows the current block with its finish line, why, how, if-then, and a countdown
bar that drains. Ten minutes before the end of a pressure block, a second notification
repeats the finish line. When it ends, one tap: Done, Partly, or Skip.

**When you don't feel like it.** Press "Not feeling it" on the now panel. It shows, in
this order: your if-then, the minimum version with a "Start the minimum" button, what
skipping costs, your anti-vision, and your vision last. Then you choose: start, start
the minimum, or skip on purpose. Nothing here appears unless you ask for it. If something unplanned happened, log it in the actual lane
("Drift · phone, 45 min"). Nothing else is required.

**Evening (under 5 minutes total).** The evening notification opens the review:

1. Resolve: every block still marked "planned" gets Done, Partly or Skip.
2. Fill gaps: untracked stretches of 30 minutes or more are listed; label each
   (an activity, rest, drift) or leave it unknown.
3. Reflect: three short prompts and an optional rating.
4. Plan tomorrow: recurring blocks are already there; add or adjust the rest; write
   tomorrow's main focus. Done.

**Weekly (later milestone).** A summary of the week and a few prompts, including a
check on activities that keep getting skipped.

## 6. Requirements

Priority: **P0** = needed before daily use can start, **P1** = soon after, **P2** = later.
Milestones are in [ROADMAP.md](ROADMAP.md).

### Today and day view

| ID | P | Requirement |
| --- | --- | --- |
| T1 | P0 | Day grid with hours on the vertical axis and two lanes, Plan and Actual, visible at the same time on desktop and on phone. |
| T2 | P0 | A "now" line across both lanes on today's date. The grid opens scrolled so that now is in view. |
| T3 | P0 | Now panel: current block's title, focus, done-when, why, how, if-then, minimum version, time left, and Done / Partly / Skip. Between blocks it shows the free time until the next block and a "log what I'm doing" action. |
| T4 | P0 | Create a block: click an empty slot or press the add button; pick an activity or type a title; set start and duration. |
| T5 | P0 | Edit and delete a block from a detail panel. |
| T6 | P0 | Navigate to any date (previous, next, today, date picker). The date is in the URL. |
| T7 | P0 | Blocks may cross midnight (sleep). The tail appears at the top of the next day. |
| T8 | P0 | Day totals: time on purpose, drift, and untracked time, updating live every minute. |
| T9 | P1 | Drag to move and resize blocks, snapping to 5 minutes. |
| T10 | P1 | Keyboard shortcuts on desktop (see DESIGN.md). |
| T11 | P1 | Replan: shift all remaining planned blocks today by N minutes, or push one block to tomorrow. |

### Intent

| ID | P | Requirement |
| --- | --- | --- |
| I1 | P0 | Activity library: create, edit, archive activities with category, icon, default duration, why, how, if-then, minimum version, cost of skipping, an optional default done-when, and the pressure switch. |
| I2 | P0 | A block created from an activity inherits its intent fields; each can be overridden per block. |
| I3 | P0 | A block can have a one-line focus for the day. |
| I4 | P0 | Categories: sensible defaults seeded on first run (see DESIGN.md); editable name, colour, icon, kind. |

### Tracking what happened

| ID | P | Requirement |
| --- | --- | --- |
| A1 | P0 | Mark a block Done (actual = plan by default), Partly (enter actual minutes; quick choices offered), or Skip (optional reason: tired, no time, chose something else, forgot, other). One tap for Done. |
| A2 | P0 | Adjust a block's actual start and duration afterwards. |
| A3 | P0 | Add an unplanned entry to the actual lane with a title, category, start and duration. Drift is one tap away. |
| A4 | P0 | Undo a status (back to planned). |
| A5 | P0 | An optional one-line note on any block after the fact. |

### Vision and anti-vision

Something to look at on a lazy day. It is pulled by the user, never pushed by the app.

| ID | P | Requirement |
| --- | --- | --- |
| V1 | P0 | Compass screen with two texts: vision ("The life I'm building") and anti-vision ("The life I refuse to drift into"). Free text, edited in place, each with two or three guiding questions shown while empty. |
| V2 | P0 | "Not feeling it" view, opened from the now panel for the current or next block. Order: if-then, minimum version with "Start the minimum", cost of skipping, anti-vision, vision. Ends with three actions: Start, Start the minimum, Skip on purpose. |
| V3 | P0 | "Start the minimum" keeps the block but marks that the minimum was chosen; finishing it counts as Partly with the minimum noted, and never as a skip. |
| V4 | P0 | Anti-vision and cost of skipping never appear in notifications, on the Today screen by default, or in any automatic message. |
| V5 | P1 | The weekly review offers "Reread your compass" and, once a quarter, "Is this still true? Rewrite it." The skip check (R7) links to the activity's cost of skipping. |
| V6 | P2 | One image each for vision and anti-vision. |

### Urgency and pace

Pressure is applied where it helps (deep work) and kept away from where it hurts (sleep,
meditation, rest). It always points forward: time left, distance to a finish line.

| ID | P | Requirement |
| --- | --- | --- |
| U1 | P0 | "Done when" line on a block, shown on the now panel directly under the title. |
| U2 | P0 | Draining countdown on the now panel for pressure blocks: a bar that shrinks as the block's time runs out, with the minutes left. Blocks without pressure show the time left as plain text. |
| U3 | P0 | Ten-minutes-left notification for pressure blocks of 30 minutes or more, repeating the done-when line. Can be switched off globally. |
| U4 | P0 | Untracked time grows live in the actual lane, minute by minute, behind the now line, and the untracked total counts up with it. It does not wait for the evening review. |
| U5 | P1 | Weekly target per category, in hours. Pace is shown on the now panel and the week view: "Deep work: 9 of 15h · 3 days left · behind by 1h 30m". |
| U6 | P1 | Goals with a title, a why and an optional due date. An activity can link to one goal. The now panel shows the goal and its days left next to the why ("Launch the course · 38 days left"). A goals screen lists them with days left and hours invested. |
| U7 | P2 | Goals can be grouped by horizon (quarter, month, week) and nested. |

### Planning ahead

| ID | P | Requirement |
| --- | --- | --- |
| P1 | P0 | "Plan tomorrow" flow reachable from the review and from a button on today. |
| P2 | P0 | Copy a day's plan from another date as a starting point. |
| P3 | P0 | Recurring blocks: repeat on chosen weekdays from a start date, with an optional end date. Each occurrence is a normal block that can be changed or skipped on its own. |
| P4 | P0 | Blocks can be added to any future date. |
| P5 | P0 | A main focus line per day ("what makes tomorrow a win"). Shown on the now panel that day. |
| P6 | P1 | Week view: seven days side by side, plan lane, with the actual lane for past days. |
| P7 | P1 | Month view: a calendar showing which days have non-recurring blocks; click a day to open it. |
| P8 | P1 | Inbox: capture things without a date and schedule them later. |

### Review and looking back

| ID | P | Requirement |
| --- | --- | --- |
| R1 | P0 | Evening review flow as in section 5: resolve, fill gaps, reflect, plan tomorrow. Each step can be skipped. |
| R2 | P0 | Reflection prompts: "What went well?", "Where did time drift, and what triggered it?", "One change for tomorrow". Optional day rating (1–5) and energy (1–5). |
| R3 | P0 | Any past day can be opened and shows its plan lane, actual lane, totals and review notes. |
| R4 | P1 | Insights for the last 7 and 30 days: time on purpose versus drift, planned versus actual minutes per activity, most-skipped activities, drift by time of day. |
| R5 | P1 | Estimation hint: when planning an activity, show "you plan 3h, you average 1h 50m". |
| R6 | P1 | Weekly review: week summary plus prompts (keep, change, drop) and one obstacle question for next week. |
| R7 | P1 | Skip check: when an activity is skipped 3 times in 7 days, ask once: shrink it, move it, rewrite the why, or drop it. |
| R8 | P1 | You versus last week's you, in the weekly review: the same weekdays compared ("By Tuesday evening last week: 2h deep work. This week: 1h 10m."). |
| R9 | P2 | Time perspective, in the weekly review only: a year progress bar, and an optional life-in-weeks grid (needs a birth date in settings). Never shown on the Today screen. |
| R10 | P2 | Shareable week card: an image of the week's numbers generated on the device, for the user to post if they choose. Nothing is published by the app. |
| R11 | P2 | Export all data as JSON. |

### Notifications

| ID | P | Requirement |
| --- | --- | --- |
| N1 | P0 | Push notification when a planned block starts: title and focus as the heading, the why as the body. Tapping opens the app on today. |
| N2 | P0 | Morning nudge at a set time (today's main focus) and evening nudge at a set time (review and plan tomorrow). |
| N3 | P0 | Notifications can be enabled per device (PC and phone), and switched off per type and per activity. |
| N4 | P0 | At most two notifications per block: its start, and for pressure blocks the ten-minutes-left warning (U3). No repeats, no "you haven't done X" reminders. |

### Platform

| ID | P | Requirement |
| --- | --- | --- |
| S1 | P0 | Changes appear on the other device within about a second, without a refresh. |
| S2 | P0 | Installable on Android and on desktop as a PWA. |
| S3 | P0 | One account (email and password). Sign-up is restricted to an allow-listed email. |
| S4 | P0 | Offline: the last synced plan for today is readable, clearly marked as offline, with editing disabled. |
| S5 | P0 | Light and dark themes following the system, with a manual switch. |

## 7. Plan versus actual rules

These rules are the heart of the product. They are implemented once, as pure functions.

1. A block has plan times, actual times, or both. Never neither.
2. Status `planned`: no actual times. Status `done` or `partial`: actual times present.
   Status `skipped`: no actual times.
3. An unplanned entry has no plan times and status `done`.
4. **The past is edited as actual; the future is edited as plan.** On today, moving or
   resizing a block that has not started changes the plan. Changing a block that has
   started or ended changes its actual times. On past days the plan is frozen unless the
   user explicitly chooses "edit plan". On future days there is only a plan.
5. Marking Done sets actual = plan, except that the actual start is pushed later if the
   previous actual entry ran over it (no overlaps in the actual lane).
6. Within one lane, blocks do not overlap. One thing at a time is the point. An edit that
   would create an overlap is rejected with a clear message.
7. Times snap to 5 minutes. Minimum duration is 5 minutes.
8. **Untracked time** is any stretch of the actual lane, before now, covered by nothing.
   It is shown as a faint hatch, counted in the day totals, and offered for labelling in
   the evening review. It is not automatically drift.
9. Time on purpose = actual minutes in `intentional` categories. Drift = actual minutes in
   `drift` categories. Maintenance is neither.

### Pace rules

1. A week runs from the configured first weekday. Weekly progress for a category = actual
   minutes in that category this week, including the running block up to now.
2. Expected so far = target × (completed days ÷ 7). Today does not count as completed
   until its review is closed or the day is over, so the morning never starts "behind".
3. The pace line shows progress, days left including today, and the difference from
   expected as "ahead by" or "behind by". When behind, it also shows the hours per
   remaining day needed to reach the target.
4. Days left for a goal = calendar days from today to its due date. On and after the due
   date it reads "due today" or "N days over", in the normal text colour.
5. Pace and days-left are stated as plain facts. No colour alarms, no commentary.

## 8. Non-goals

- Meetings, invitations, attendees, video links.
- Google Calendar or any other integration.
- Multiple users, public pages, anything the app publishes itself. (The week card, R10,
  is an image the user may post by hand.)
- Guilt as motivation: "you wasted X hours of your life", comparisons with other people,
  punishing streaks. Comparison is only ever with your own past weeks. (The anti-vision
  is not this: it is written by the user, looks forward, and is opened by choice.)
- A task manager: no projects, subtasks, priorities, tags.
- Automatic time tracking (screen time, app usage).
- Points, badges, levels, streak counters that break.
- AI features. Possible later, not in scope now.
- Native apps. The PWA is the product.

## 9. Success criteria

Judged after four weeks of real use:

- The app is opened and the evening review is completed on at least 6 days out of 7.
- Planning tomorrow takes under 2 minutes; the evening review under 3.
- Marking a block takes one tap from the notification-opened screen.
- Looking at any day from the last two weeks answers "what did I actually do, and where
  did the time go?" without relying on memory.
- Weekly drift is trending down, or at least it is now a known number.

## 10. Assumptions and open questions

Assumptions made without asking; change them here if wrong:

- UI in English, 24-hour clock, week starts on Monday, time zone from the device.
- Visual style close to Structured: colourful, rounded, icon per block, with a dark theme.
- Blocks never overlap within a lane.
- Free sign-up is closed; the single account is created once.

Open questions for later:

- Should there be a "committed plan" snapshot each morning, so that replanning during the
  day does not hide the original intent? Start without it; revisit after two weeks of use.
- Should notifications offer Done and Skip buttons directly? Needs a secure action link;
  deferred until after M4.
- Is one focus line per day enough, or is a short "top 3" better? Decide from use.
- Does the ten-minutes-left warning help or irritate during creative blocks such as
  scripting? Review after two weeks; it is a per-activity switch for that reason.
- Should a weekly target also exist per activity ("Gym 3 times"), counted in sessions
  rather than hours? Start with hours per category.
