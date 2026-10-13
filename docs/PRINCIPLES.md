# Principles — why the product is shaped this way

A short research pass (2026-10-13) on what makes planning tools work and what makes
people abandon them, translated into concrete design decisions. Evidence strength is
labelled honestly: **strong** = meta-analysis found in this pass, **moderate** = single
studies or mixed results, **reasoning** = widely used idea that was not verified here.

## What was already right in the original idea

| Your instinct | What the research says | Strength |
| --- | --- | --- |
| Write down why and how, not just the task. | Plans that specify when, where and how ("implementation intentions") reliably raise follow-through. A meta-analysis of 94 studies found a medium-to-large effect (d ≈ 0.65). Effects are larger with an if-then format, when motivation is already high, and when the plan is rehearsed. | Strong |
| Plan the day in visible blocks. | A time block is itself a when-and-where plan, which is the same mechanism. | Strong (by extension) |
| Reflect at the end of the day and look back at what really happened. | Monitoring progress toward a goal improves attainment (138 studies, d ≈ 0.40), and the effect is larger when the result is physically recorded rather than just noticed. | Strong |
| Review at night, plan tomorrow. | A fixed end-of-day routine that captures loose ends and sets up the next day is a well-known practice (the "shutdown ritual"). Evidence is practitioner-level. | Reasoning |

## What to add

| # | Addition | Why | Strength | Where it lives |
| --- | --- | --- | --- | --- |
| 1 | **If-then line** on every activity: "If I don't feel like it, then…" | The if-then format is the specific ingredient with the biggest effect, and it targets exactly the "tired, lost, don't want to" moment you described. | Strong | Intent fields; now panel |
| 2 | **Minimum version**: the smallest version that still counts. | Turns a skip into a small win and removes the all-or-nothing trap. | Reasoning | Intent fields; "Partly" status |
| 3 | **Why in the notification**, not just the title. | The why has to arrive at the moment of decision, which is usually before the app is open. Rehearsal also strengthens the plan. | Strong (rehearsal) | N1 |
| 4 | **Actual lane always visible**, logging by one tap. | Recording is what makes monitoring work; it only survives if it is nearly free. | Strong | T1, A1 |
| 5 | **Evening fix-up of gaps**, with "untracked" kept separate from "drift". | People stop tracking when the data feels inaccurate or useless. Honest gaps are better than invented precision. | Moderate | R1, rule 8 |
| 6 | **Make the data pay you back quickly**: day totals from day one, insights after a week. | Loss of motivation and "the data doesn't tell me anything" are the leading reasons for abandoning self-tracking. | Moderate | T8, R4 |
| 7 | **Your own estimation ratio** ("you plan 3h, you average 1h 50m"). | People systematically underestimate how long things take (the planning fallacy). Your own history is the best correction. | Reasoning | R5 |
| 8 | **No broken streaks, no red marks, a friendly return after a lapse.** | A lapse followed by shame is a common exit point. Show consistency as "6 of the last 7 days" and never as a counter that resets to zero. | Moderate | Voice; insights |
| 9 | **Skip check**: after three skips in a week, ask whether to shrink, move, rewrite the why, or drop the activity. | A why that no longer convinces you needs editing, not more reminders. Keeps the plan something you chose. | Reasoning | R7 |
| 10 | **Rest on purpose is a first-class block** and counts as time on purpose. | With a lot of free time the goal is not maximum work, it is that leisure is chosen. Otherwise every break reads as failure and the tool becomes unpleasant. | Reasoning | Categories |
| 11 | **Planning must be cheap**: activities remember their intent, recurring blocks, copy a day. | Effort is the main enemy of a daily habit. Writing a why from scratch every day would last a week. | Moderate | I1, P2, P3 |
| 12 | **One obstacle question in the weekly review**: "What is most likely to get in the way next week, and what will I do then?" | Imagining the obstacle and pairing it with a plan (WOOP) helps, but measured effects are small and results are mixed, so it gets one prompt a week, not a field on every block. | Moderate | R6 |
| 13 | **Link activities to a bigger goal** with a due date. | Connects the daily why to the larger picture, and gives it a deadline. | Reasoning | U6 |

## Urgency: pressure from finish lines, not from guilt

Added on 2026-10-13 after a follow-up question about working in a state of urgency.

Two things feel like urgency and have opposite effects on a tool you must open daily:

- **Time running out toward a finish line** ("10 minutes left to finish the draft",
  "38 days to launch"). It makes you start.
- **Guilt and comparison** ("my peers are ahead", "I wasted today"). It makes you avoid
  looking, and a planner that is not opened does nothing.

The product uses only the first kind. Evidence note: the claim that alertness with some
agitation helps focus and learning was recalled from Andrew Huberman's material and was
**not verified** in this research pass. The usual caveat, also unverified here, is that
moderate pressure helps and high pressure hurts, creative work most of all. That is why
pressure is a per-activity switch: on for deep work, off for sleep, meditation and rest.

| # | Feature | Why | Strength | Where it lives |
| --- | --- | --- | --- | --- |
| 14 | **"Done when" line** on a block. | A countdown needs something to push against. "Script drafted, 300 words" turns a time block into a deadline. | Reasoning | U1 |
| 15 | **Draining countdown** and a **ten-minutes-left** notification that repeats the finish line. | Makes the deadline felt at the moment it matters, without opening the app. | Reasoning | U2, U3 |
| 16 | **Untracked time growing live** in the actual lane. | The cost of drifting is visible while it can still be stopped, not in an evening report. | Reasoning | U4 |
| 17 | **Weekly pace against a target** ("9 of 15h, 3 days left, behind by 1h 30m"). | Recreates the deadline effect every week for someone whose calendar has no deadlines. | Reasoning; monitoring evidence is strong | U5 |
| 18 | **Goals with days left**, shown beside the why. | Ties today's block to a date that is approaching. | Reasoning | U6 |
| 19 | **You versus last week's you**, in the weekly review. | The push of comparison without anyone else's numbers. | Reasoning | R8 |
| 20 | **Year bar and life-in-weeks grid**, weekly review only. | Makes "time is finite" visible. Seen all day it turns into wallpaper; seen once a week it lands. | Reasoning | R9 |
| 21 | **Shareable week card.** | In the monitoring meta-analysis, effects were larger when progress was reported or made public. An audience already exists. | Strong | R10 |

## Anti-vision: a picture of what you refuse

Added on 2026-10-13. An anti-vision is a written description of the life you end up with
if you keep drifting. It is avoidance motivation: moving away from something. That is a
real and fast-acting motive, and it also has a known downside, so the design uses it in a
particular way. Evidence note: none of the following was verified in this research pass;
it is reasoning from well-known ideas (possible selves, approach and avoidance goals,
mental contrasting).

Why it does not contradict "no guilt":

| Guilt (left out) | Anti-vision (included) |
| --- | --- |
| Written by the app | Written by you, in your words |
| About the past, which cannot be changed | About a future that can still be avoided |
| Pushed at you: notifications, banners, counters | Pulled by you, when you press "Not feeling it" |
| Ends in a verdict | Ends in an action: start, or start the minimum |

How it is built so that it keeps working:

| # | Decision | Why |
| --- | --- | --- |
| 22 | **Shown on request only**, never in notifications or on the Today screen. | Fear that is always visible either stops being noticed or makes you avoid the screen. Kept rare, it keeps its force. |
| 23 | **Always paired with the vision, and the vision comes last.** | Running from something tells you to move, not where to. Ending on the vision leaves you facing forward. |
| 24 | **Always followed by the smallest next step** (if-then, minimum version, a Start button). | A hard look at the future without a way to act on it produces anxiety, not work. |
| 25 | **A small version per activity**: "If I keep skipping this, in a year…". | Concrete beats general. "Gym skipped for a year" is easier to picture than a whole life. |
| 26 | **Reread weekly, rewritten quarterly.** | Text you have read fifty times stops landing. Rewriting it is what keeps it true. |

Writing prompts offered on the Compass screen:

- Anti-vision: "If nothing changes, what does an ordinary Tuesday look like in three
  years?" · "What would I be embarrassed to still be saying?" · "What will I have
  stopped believing I can do?"
- Vision: "What does an ordinary Tuesday look like in three years if I use my time on
  purpose?" · "What am I proud of having built?" · "Who benefits from it?"

## What was deliberately left out

- **Live start/stop timers.** Most accurate, first thing people stop using.
- **Points, badges, streak counters.** They work until the first miss, then they punish.
- **Guilt messages** such as "you wasted X hours of your life", and any comparison with
  other people. After one bad day they become a reason not to open the app. A missed day
  just shows today's plan.
- **Many metrics.** Two numbers a day (on purpose, drift) are enough to steer by.
- **Repeat or escalating reminders.** At most a start notification and one
  ten-minutes-left warning per block. A tool that nags gets muted.

## The stickiness checklist

Use this when judging any new feature:

1. Does it make the daily loop faster, or slower?
2. Does it show up at the moment of decision, or only in a report?
3. Does it leave you feeling informed, or judged?
4. Would it still be used on a bad day?
5. If it adds pressure, does the pressure point at a finish line ahead, or at a failure
   behind?

## Sources

- Implementation intentions: Gollwitzer and Oettingen, [Planning promotes goal striving](https://www.socmot.uni-konstanz.de/sites/default/files/Gollwitzer_Oettingen_11_Planning_Goal_Striving.pdf); overview at [The Behavioral Scientist](https://www.thebehavioralscientist.com/glossary/implementation-intentions); meta-analysis record at [KOPS Konstanz](https://kops.uni-konstanz.de/handle/123456789/69905).
- Monitoring progress: Harkin et al. 2016, Psychological Bulletin, [Does monitoring goal progress promote goal attainment?](https://eprints.whiterose.ac.uk/91437/); [APA summary](https://www.apa.org/news/press/releases/2015/10/progress-goals).
- Abandonment of tracking tools: Epstein et al., [Beyond abandonment to next steps](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5428074/); Attig and Franke, [Abandonment of personal quantification](https://research.uni-luebeck.de/en/publications/abandonment-of-personal-quantification-a-review-and-empirical-stu/).
- WOOP and its mixed evidence: [Shortform summary](https://www.shortform.com/blog/gabriele-oettingen-woop/); [KQED MindShift](https://www.kqed.org/mindshift/38827/why-understanding-obstacles-is-essential-to-achieving-goals).
- Shutdown ritual and plan versus day: [Simply Psychology](https://www.simplypsychology.org/shutdown-ritual.html); [MacSparky, The plan vs. the day](https://www.macsparky.com/blog/2021/7/the-plan-vs-the-day/).
- Structured (the reference app): [Dave Swift review](https://daveswift.com/structured/); [Cool Curation review](https://coolcuration.com/structured-app-review-uk).
