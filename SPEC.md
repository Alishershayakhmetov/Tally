# Task Counter App: Specification

> Status: **Phases 0–1 built** (browser-verified, not yet run on a phone) · Drafted 2026-09-29 · Rev. 2 same day (week start setting, negative counters, day-start setting) · Rev. 3 (per-task day start, history re-groups when a cutoff changes)
> Working title: *Task Counter* (final name TBD)

A cross-platform mobile app for self-set counting goals: *"Do 1000 push-ups"*, *"100 squats every day"*, *"Plank 60 minutes this month"*. You create a task, log progress with quick buttons or a stopwatch, and see how far you are from the target. **All data lives on the device first.** The data model is designed so cloud sync can be added later without a rewrite.

This is a **portfolio / course project**, so code quality, tests, README and CI count as much as the features.

---

## 1. Decisions so far

| Topic | Decision |
|---|---|
| Framework | **React Native + Expo (TypeScript)**. See §2 for the comparison with Flutter. |
| Test device | **Android phone** (real device, via Expo Go) |
| Goal model | User-defined target, with an optional **deadline** and an optional **recurring quota** |
| Recurrence | **Daily, weekly, monthly, specific weekdays** |
| Logging | Default buttons **−1, +1, +5, +10**, configurable per task, plus **"enter any number"** |
| Negative values | **Allowed**: counters can go below zero |
| Week start | **Setting**: Auto (device locale) / Monday / Sunday (§3.5) |
| Day boundary | **Global default** "New day starts at" (00:00 out of the box) applies to all tasks, and **each task can override it**. At 04:00, logs made at 01:30 count for the previous day. Changing a cutoff **re-groups past entries** (§3.5). |
| Measures | **Counts** (integers) and **time** (built-in stopwatch plus manual entry) |
| v1 extras | **Progress bar + % + remaining**, **reminder notifications** |
| Reminders | **Per-task time, skipped if the current quota is already met** |
| Language | **English + Russian**, following the phone language, with an override in settings |
| Storage | **Local-first (SQLite)**, designed for **cloud sync later** (§6) |
| Audience | **Portfolio / course project** |

---

## 2. Framework comparison: React Native (Expo) vs Flutter

| Criterion | React Native + Expo | Flutter |
|---|---|---|
| Language | TypeScript. Huge npm ecosystem, and the skills carry over to web. | Dart. Easy to learn if you know TS/Java/C#, but a smaller ecosystem. |
| UI rendering | Real native components, so each platform looks native. Pixel-identical design takes extra work. | Draws its own UI (Impeller), so it looks identical everywhere and animations are very smooth. Doesn't look "native" by default. |
| Setup on this PC | Node 24 is already installed. `npx create-expo-app` and you're running. | Needs the Flutter SDK plus Android Studio / Android SDK first. |
| Run on an Android phone | **Expo Go** app: scan a QR code, no SDK or USB debugging needed. | USB debugging or an emulator, with the Android SDK required. |
| Run on an iPhone from Windows | Yes, via Expo Go. Store builds via EAS cloud build. | **No.** Needs a Mac, or paid cloud CI plus an Apple developer account. |
| Performance | JS layer (new architecture/JSI). More than enough for this app. Heavy animation needs Reanimated. | Compiled to native code. The best choice for complex custom visuals. |
| Local database | expo-sqlite + Drizzle ORM (typed, with migrations) | drift (typed SQLite, excellent) |
| Local notifications | expo-notifications | flutter_local_notifications |
| Over-the-air updates | EAS Update (push JS fixes without a store release) | Not built in (Shorebird is a third-party option) |
| Maintenance pain | Expo SDK upgrades about twice a year can break third-party libraries | Fewer breaking upgrades; plugin quality varies |
| Extra targets | Web (Expo web) | Web plus Windows/macOS/Linux desktop |
| App size | Smaller | Larger baseline binary |

**Why Expo for this project:** it's the zero-install start on this machine, runs on a real phone the same day, and keeps the iOS door open without a Mac. It also uses TypeScript, so the domain logic can be plain, testable TS modules. The only thing Flutter would win here is animation polish, and a counter app doesn't need it.

---

## 3. Core concepts

### 3.1 Task
A task has:
- **Name**, an **emoji** and a **color** (for recognisable cards)
- **Measure**: `count` (integers; the unit is a free-text label such as "push-ups") or `duration` (stored as seconds, shown as `h:mm:ss`)
- **Target**: a positive number (count units, or a time entered as hours/minutes)
- **Recurrence** (optional):
  - `none`: the target is a **total** ("1000 push-ups")
  - `daily`: the target applies **per day**. An optional **weekday mask** limits which days have a quota ("100 on Mon/Wed/Fri").
  - `weekly`: per week (start day from Settings, §3.5)
  - `monthly`: per calendar month
  - All periods are made of **logical days** (§3.5), not raw midnight-to-midnight days.
- **Deadline / end date** (optional):
  - with recurrence `none`, it's a **deadline** ("1000 by Oct 31")
  - with a recurrence, it's the **end of the challenge** ("100/day until Dec 31")
- **Start date**: defaults to today. Entries before it are not allowed.
- **Day starts at** (optional): this task's own cutoff. Empty means it follows the global default (§3.5).
- **Increment buttons**: a signed list, default `[-1, +1, +5, +10]` (duration tasks: `[-1, +1, +5, +10]` **minutes**)
- **Reminder time** (optional): for example `19:00`

### 3.2 Entry (the log)
Every change to a counter is an **entry** with a signed amount. **The counter value is never stored. It is always the sum of entries.** This makes undo and history trivial, and makes sync conflict-free (§6).

- **Tap coalescing**: rapid taps on the counter screen (each within **2 s** of the previous one) update the same entry instead of creating new rows. 23 taps of +1 become one "+23 at 19:04" entry. Without this, 1000 push-ups would mean 1000 rows, an unreadable history and a bloated sync payload. The entry is written on every tap, so killing the app mid-burst loses nothing. A burst never crosses the day boundary: the first tap after it starts a new entry. Taps only merge in the same direction: a −1 after a run of +1 starts its own entry, so corrections stay visible in the history.
- **Negative totals are allowed**: −1 at 0 gives −1, and there's no guard anywhere. This works for corrections and for things that can go down. It applies to duration tasks too (−3:00 is valid).
- **Overshoot is allowed**: 1040 / 1000 shows **104%**, with a "done" state.

### 3.3 Progress display (v1)
Each task card shows:
- Total tasks: `640 / 1000 push-ups · 64% · 360 left`, plus `12 days left` when there's a deadline
- Recurring tasks: `Today 60 / 100 · 60% · 40 left` (or `This week` / `This month`). On weekdays outside the mask it shows `Rest day`.
- A progress bar. Reaching the target triggers a completion state (checkmark, haptic feedback).
- Below zero, the number and "left" are shown as they are (`−5 / 100 · 105 left`). The bar is empty and the percentage is floored at `0%`.

### 3.4 Task lifecycle
- **Active**: the default.
- **Finished**: when the deadline or end date has passed. Shown in a separate section, with the result (reached / missed). Editing the deadline reopens it.
- **Archived**: manually hidden. Can be restored.
- **Deleted**: soft delete (tombstone) after confirmation. Hidden everywhere.

### 3.5 Days and weeks (user settings)
- **Cutoff** = the time a new day begins. Anything logged before it counts toward the **previous** day. With 04:00, push-ups at 01:30 on Tuesday count for Monday. Range **00:00–12:00**, in 15-minute steps.
- **Two levels:**
  - **Global default** (Settings, "New day starts at", **00:00** out of the box) applies to **every task** that has no cutoff of its own.
  - **Per-task override** (Create/Edit task, "Day starts at"). For example, a "Read 20 pages" task at 03:00 can sit next to push-ups on the default. Clearing the override makes the task follow the global default again.
  - A task's **effective cutoff** is its override if set, otherwise the global default.
- Rule: `logicalDate = wallClockTime < cutoff ? calendarDate − 1 day : calendarDate`. The wall-clock time is the one shown on the device at log time (UTC + the offset stored with the entry). The rule compares or subtracts on **wall-clock time only**, never on the UTC timestamp. That keeps DST-change nights correct, for example a 02:30 cutoff on a night when 02:00–03:00 doesn't exist.
- Different tasks can be on different days at the same moment. At 02:00, a 00:00-cutoff task already shows Tuesday while a 04:00-cutoff task still shows Monday. Each card uses its own effective cutoff.
- **Everything day-based uses logical dates**:
  - "Today" and daily quotas, the weekday mask, weeks and months
  - Deadlines: a deadline of Oct 31 with a 04:00 cutoff accepts logs until Nov 1 03:59.
  - Reminders (§5) and the stopwatch's day (§4.1)
  - When Home rolls over to the next day: a timer runs to the **nearest** boundary among all tasks' cutoffs, and the app re-checks when it comes back to the foreground.
- **"Week starts on"** (Settings): **Auto** (device locale, via expo-localization, the default) / **Monday** / **Sunday**. Domain code accepts any start weekday, so a locale whose week starts on Saturday also works under Auto.
- **When a setting changes, history re-groups.** Days, weeks and periods always follow the current settings.
  - *Week start*: every task's weeks re-group.
  - *Global cutoff*: every task **without** an override re-groups. Tasks with their own cutoff are untouched.
  - *A task's cutoff* (set, changed or cleared): only that task re-groups.
  - Consequence (accepted): a past day that met its quota can become a missed day, and the reverse. The Edit screen and Settings say so in a note next to the picker. Reminders are re-planned (§5).
  - This is cheap because an entry's day is **never the source of truth**. It's derived from `occurred_at` + `utc_offset_min`, which never change (§6.2).

---

## 4. Screens (v1)

1. **Home**: task cards (Active, then a collapsible Finished section) and a "+" button for a new task. Tapping a card opens the counter.
2. **Counter** (task detail):
   - Big current value and progress bar
   - Increment buttons in a large, thumb-friendly layout. **"Enter amount"** opens a numeric sheet (accepts negative values for corrections).
   - Duration tasks: **stopwatch** (Start / Pause / Stop → logs the elapsed time) plus manual `mm:ss` entry
   - An **"Undo" snackbar** after each logged change
   - Recent entries, and a link to the full history
3. **Create / Edit task**: the fields from §3.1 (the day-start picker shows "Default (04:00)" until overridden), and a preview of the card
4. **History** (per task): entries grouped by day, with delete (and edit amount)
5. **Settings**: language (System / English / Русский), theme (System / Light / Dark), **week starts on** (Auto / Monday / Sunday), **new day starts at** (global default cutoff for all tasks, 00:00–12:00), notification permission status, about

### 4.1 Stopwatch rules
- The timer state is **persisted** (`first_started_at`, `running_since` and accumulated time in the `active_timer` table), and elapsed time is computed from timestamps, not a JS interval. It survives backgrounding, screen lock and app kill.
- Only one timer runs at a time in v1.
- Screen stays awake while the counter screen is open with a running timer (`expo-keep-awake`).
- A timer running across the day boundary (§3.5) is logged to the **logical day it started**. The entry's `occurred_at` is the moment the timer was **first started**, so re-grouping keeps it on the right day.

---

## 5. Reminders ("skip if done")

A local notification can't run app code at fire time to decide whether to show itself. **But progress can only change inside the app**, so the app always knows when to cancel:

- A pure **reminder planner** (`domain/reminders.ts`) takes the task, current progress and "now". It returns the next **N fire times** (a 14-day window), **skipping periods whose quota is already met**:
  - daily with a weekday mask: only on quota days, and only if today's quota isn't met
  - weekly / monthly: every day at the set time, until that period's quota is met
  - total (no recurrence): every day, skipped if something was already logged that day. Stops after the target is reached or the deadline passes.
- Each fire time is first mapped to its **logical day** using the task's effective cutoff (§3.5), and then the quota and weekday mask are checked. With a 04:00 cutoff, a 01:00 reminder on Tuesday belongs to Monday's quota.
- **Re-plan triggers**: logging an entry, editing or deleting a task, app start or foreground, language change (notification text is localised), a change to the week start or any cutoff.
- Notification text: "💪 Push-ups: 40 left today" (in EN/RU).
- Android 13+ needs the **POST_NOTIFICATIONS** runtime permission. Ask the first time the user sets a reminder, not at app launch.
- Android may deliver a few minutes late (Doze / inexact alarms). That's acceptable for this use case.

---

## 6. Data and local-first design

### 6.1 Stack
- **expo-sqlite** + **Drizzle ORM** (typed schema, `drizzle-kit` generated migrations run at startup via `useMigrations`, and `useLiveQuery` so the UI re-renders when rows change)
- IDs from `expo-crypto` `randomUUID()`

### 6.2 Schema (draft)

```text
tasks
  id               TEXT PK          -- UUID, generated on device
  name             TEXT NOT NULL
  emoji            TEXT
  color            TEXT NOT NULL
  measure          TEXT NOT NULL    -- 'count' | 'duration'
  unit_label       TEXT             -- count only, e.g. "push-ups"
  target           INTEGER NOT NULL -- units, or seconds for duration
  recurrence       TEXT NOT NULL    -- 'none' | 'daily' | 'weekly' | 'monthly'
  weekday_mask     INTEGER          -- daily only; Mon=1 … Sun=64, 127 = every day
  start_date       TEXT NOT NULL    -- 'YYYY-MM-DD' (local)
  end_date         TEXT             -- deadline / challenge end, 'YYYY-MM-DD'
  increments       TEXT NOT NULL    -- JSON array of signed ints, e.g. [-1,1,5,10]
  reminder_time    TEXT             -- 'HH:MM' local, NULL = off
  day_start_min    INTEGER          -- per-task cutoff, 0–720; NULL = use global default
  sort_order       REAL NOT NULL
  archived_at      INTEGER
  created_at       INTEGER NOT NULL -- UTC epoch ms
  updated_at       INTEGER NOT NULL
  deleted_at       INTEGER          -- tombstone

entries
  id               TEXT PK
  task_id          TEXT NOT NULL → tasks.id
  amount           INTEGER NOT NULL -- signed; units or seconds
  source           TEXT NOT NULL    -- 'button' | 'manual' | 'timer'
  occurred_at      INTEGER NOT NULL -- UTC epoch ms; immutable
  utc_offset_min   INTEGER NOT NULL -- device UTC offset at log time; immutable
  local_date       TEXT NOT NULL    -- DERIVED CACHE: logical date under the task's
                                    -- current effective cutoff, 'YYYY-MM-DD'
  created_at, updated_at, deleted_at
  INDEX (task_id, local_date) WHERE deleted_at IS NULL

active_timer                         -- at most one row in v1
  task_id          TEXT PK
  first_started_at INTEGER NOT NULL -- UTC ms; becomes the entry's occurred_at
  utc_offset_min   INTEGER NOT NULL -- offset at first start
  running_since    INTEGER          -- UTC ms; NULL while paused
  accumulated_ms   INTEGER NOT NULL

settings                             -- key/value
  language, theme, device_id,
  week_start      -- 'auto' | 0–6 (0 = Sunday)
  day_start_min   -- global default cutoff, 0–720 minutes after midnight (default 0)
```

**How `local_date` works.** The source of truth is `occurred_at` + `utc_offset_min`, which together give the wall-clock time you saw when you logged. Storing the offset means that if you log push-ups on Monday evening and then travel across time zones, they stay on Monday. `local_date` is a cache of the logical date under the current cutoff, kept only so that per-day sums can use the index. It's filled in on insert. When a cutoff changes, one SQL statement recomputes it for the affected tasks:

```sql
-- :cutoff_s = effective cutoff in seconds; wall-clock arithmetic, so DST-safe
UPDATE entries
SET local_date = date(occurred_at / 1000 + utc_offset_min * 60 - :cutoff_s, 'unixepoch')
WHERE task_id IN (:affected_task_ids);
```

This re-groups thousands of entries in milliseconds. It's a local cache, so it **doesn't touch `updated_at`** and would never be synced.

### 6.3 Sync-readiness rules (followed from day one, sync itself built later)
1. **Client-generated UUIDs**, no autoincrement IDs, so rows created offline on two devices never collide.
2. **`updated_at` on every row, `deleted_at` tombstones instead of hard deletes**, so a sync layer can compute "what changed since X" and propagate deletions.
3. **Counters are sums of an append-mostly entry log**, not a stored number. Two devices logging +10 each merge to +20 with no conflict. A stored `count = 50` would need conflict resolution.
4. **Task edits** (rename, change target) resolve by last-write-wins on `updated_at` when sync arrives. That's acceptable for settings-like data.
5. All DB access goes through a small **repository layer** (`src/db/repos`). Sync later hooks in there, not in screens.
6. **Derived values are never synced.** That covers `local_date` and all totals. A second device recomputes them from the immutable `occurred_at` / `utc_offset_min` and its own settings. The per-task cutoff is a normal task field (last-write-wins). Whether the global default and week start should sync as account preferences is decided in the sync phase.

Backend choice (Supabase, PowerSync, or a custom API) is **deliberately deferred** to the sync phase.

---

## 7. Internationalisation (EN + RU)
- `i18next` + `react-i18next` + `expo-localization` (follows the device language; overridable in Settings)
- **Russian plurals** matter: "1 день / 2 дня / 5 дней". i18next handles this via `Intl.PluralRules`. Verify that Hermes provides it on the target device, and add an `intl-pluralrules` polyfill if not.
- **User-typed unit labels** ("push-ups" / "отжимания") are shown as typed. They can't be pluralised automatically, so they're displayed in a plural-neutral position (`640 / 1000 · push-ups`).
- Dates and numbers are formatted with the active locale (`Intl.DateTimeFormat` / `NumberFormat`).

---

## 8. Project structure (planned)

```text
task_counter_app/
  app/                      # expo-router (file-based routes)
    _layout.tsx
    index.tsx               # Home
    settings.tsx
    task/new.tsx
    task/[id]/index.tsx     # Counter
    task/[id]/edit.tsx
    task/[id]/history.tsx
  src/
    domain/                 # PURE TypeScript, no React/Expo imports → unit-tested
      days.ts               # effective cutoff (task ?? global); timestamp + offset + cutoff → logical date
      periods.ts            # period boundaries, weekday mask, configurable week start
      progress.ts           # totals (may be negative), %, remaining, done/finished state
      entries.ts            # tap coalescing (incl. day-boundary split)
      reminders.ts          # reminder planner (§5)
      __tests__/
    db/                     # drizzle schema, migrations, repositories
    features/               # screen-level components + hooks
    components/             # shared UI (ProgressBar, CounterButton, …)
    notifications/          # expo-notifications wrapper, uses domain/reminders
    i18n/                   # en.json, ru.json, setup
  drizzle/                  # generated SQL migrations
  SPEC.md
  README.md
```

The **domain layer is framework-free on purpose**: period math, progress, coalescing and reminder planning are the parts most likely to have bugs. They can be tested exhaustively with Jest in milliseconds, without a phone.

---

## 9. Quality bar (portfolio)
- TypeScript `strict`, ESLint + Prettier
- **Jest (`jest-expo`)**: domain tests (period edges, weekday masks, Sunday vs Monday week start, day-start cutoff including DST-change nights, per-task override vs global default, re-grouping after a cutoff change (the SQL and the TS function must agree), month lengths, leap years, negative totals, coalescing, reminder skipping), plus **React Native Testing Library** for key components
- **GitHub Actions** CI: typecheck, lint and test on every push
- A git repo from the first commit, with small meaningful commits
- README: what and why, screenshots/GIF, architecture diagram, how to run, test instructions, the local-first/sync design rationale (§6.3), known limitations
- An installable **APK** via EAS Build (cloud, free tier) for demoing without Expo Go

---

## 10. Phased plan

Each phase ends with verification **on the real Android phone**, not just "it compiles".

### Phase 0: counting core (first build)
- Expo + TS scaffold, expo-router, SQLite + Drizzle + migrations, repository layer
- Domain: logical-date function (fixed at 00:00 until the Phase 1 setting exists), progress including negative totals, tap coalescing, with unit tests
- Screens: Home (cards with progress bar / % / remaining), Create task (**count measure, total target only**), Counter (configurable buttons, enter-any-number, undo, recent entries)
- **Done when:** on the phone via Expo Go, you can create "1000 push-ups", tap +1 fifty times quickly (which gives one coalesced entry), enter 37, and undo. −1 at 0 shows −1 with an empty bar. After force-closing the app everything is still there. Domain tests are green in CI.

### Phase 1: goals and lifecycle
- Deadlines, recurring quotas (daily + weekday mask, weekly, monthly), period progress, "Rest day", Finished / Archived sections, soft delete
- History screen (grouped by day, edit / delete)
- i18n EN/RU, dark mode, Settings, including **week starts on** and the global **new day starts at**, plus the **per-task cutoff override** and history re-grouping (§3.5)
- **Done when:** period boundary tests pass (month end, leap day, Sunday and Monday week start, day-start cutoff, DST). On the phone, a daily task rolls over at the chosen day-start time, not at midnight. This is checked with a **dev-only clock override**, because the cutoff can't be set to an afternoon time. Switching the week start re-groups the current week. Changing the global cutoff re-groups the history of tasks without an override and leaves overridden tasks untouched. The UI is fully usable in Russian with correct plurals.

**Decisions made while building Phase 1** (not specified above):
- Finished tasks are read-only: buttons and "Enter amount" are disabled until the end date is moved. Archived tasks likewise, with a Restore button on the counter screen.
- An ended (finished or archived) repeating goal has no meaningful "today", so its card and counter show the all-time total and "N of M days/weeks/months met". Partial weeks/months at the start and end count as whole periods.
- Logging on a rest day is allowed and counts toward that day. It just has no quota.
- Russian "360 left" is phrased "ещё 360", which needs no plural agreement.
- Dragging a cutoff stepper re-groups history on every 15-minute step. It's cheap, and the result is always consistent with what's shown.

### Phase 2: time and reminders (completes v1)
- Duration measure: persisted stopwatch, manual `mm:ss`, minute-based buttons
- Reminders: per-task time, reminder planner with skip-if-done, re-plan triggers, permission flow
- EAS build of an APK
- **Done when:** the timer survives backgrounding and a force-close with the correct elapsed time. A reminder set for 2 minutes from now fires, and doesn't fire once the quota is met. The APK installs and runs without Expo Go.

### Later (explicitly **not** in v1)
| Feature | Why deferred |
|---|---|
| Pace vs deadline ("need 24/day, 40 ahead") | Not chosen for v1. Cheap to add from existing data (pure domain function). |
| Streaks + history charts | Not chosen for v1. Needs a chart library. The data model already supports it. |
| JSON export / import | A useful backup before sync exists. Small. |
| Cloud sync + accounts | Needs a backend choice. The v1 schema is designed for it (§6.3). |
| Combined goal ("1000 total **and** 50/day") | Doubles the progress UI complexity. Revisit if it's actually wanted. |
| Home-screen widget | Needs native code / a dev build. Nice for a portfolio later. |
| iOS build, Play Store release | Not needed for a portfolio. Needs developer accounts. |
| Multiple simultaneous timers | Edge case. One timer covers realistic use. |

---

## 11. Risks and things to verify early
- **Expo Go + notifications on Android**: Expo Go dropped *remote push* support on Android (SDK 53+). *Local scheduled* notifications are expected to work. If they misbehave, switch to a **development build** (EAS cloud build, installable APK), with no local Android SDK needed.
- **Phone can't reach the dev server**: Windows Firewall may block Metro (port 8081) on the LAN. Fall back to `npx expo start --tunnel`.
- **`Intl.PluralRules` on Hermes**: verify in Phase 1 (see §7).
- **Date math**: all period logic uses logical local dates (`YYYY-MM-DD`), never "add 24 h to a timestamp". The day-start cutoff compares wall-clock times (§3.5). Both avoid DST bugs, and both are covered by tests.

---

## 12. Assumptions (confirm or change before Phase 0)
Settled in rev. 2–3: week start is a setting, counters can go negative, the cutoff is a global default with per-task overrides, and changing a cutoff re-groups history (see §1 and §3.5).

1. Overshooting the target is allowed and shown as >100%.
2. Below zero, the bar is empty and the % is floored at 0%, while the number itself shows its true value (§3.3).
3. Rapid taps coalesce into one entry (2 s window).
4. Cutoffs (global and per-task) are limited to **00:00–12:00**. With a later cutoff (say 20:00), it becomes unclear which calendar date a day belongs to.
5. Week start is **global only** (no per-task override) and defaults to **Auto** (device locale).
6. A timer running past the day boundary counts toward the logical day it started.
7. After a deadline passes, the task moves to Finished. Editing the deadline reopens it.
8. For non-recurring tasks, the reminder is skipped on days you already logged something.
9. Working title "Task Counter". The app name, icon and color palette are to be decided.
