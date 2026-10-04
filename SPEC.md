# Tally: Specification

> Status: **Phases 0–5 built** (browser-verified; not yet run on a phone) · Drafted 2026-09-29 · Rev. 2 same day (week start setting, negative counters, day-start setting) · Rev. 3 (per-task day start, history re-groups when a cutoff changes)
> Name: *Tally* (working title was *Task Counter*)

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
- A progress bar. Reaching the target triggers a completion state (checkmark, and haptic feedback if Vibration is on in Settings).
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
5. **Settings**: language (System / English / Русский), theme (System / Light / Dark), **vibration** (haptic feedback when logging; **off** by default), **week starts on** (Auto / Monday / Sunday), **new day starts at** (global default cutoff for all tasks, 00:00–12:00), notification permission status, about

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
  note             TEXT             -- optional, ≤ 140 chars (Phase 5, migration 0003)
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

**Decisions made while building Phase 2** (not specified above):
- Time goals: a plain number means **minutes** ("25"); colon forms are `m:ss` and `h:mm:ss`. Buttons are minutes. A task's measure (count or time) is locked after creation, because existing entries would change meaning.
- The stopwatch logs whole seconds; less than a second logs nothing. Archiving or deleting a task discards its running stopwatch. Home shows a banner while one runs.
- Reminders re-plan the whole schedule (cancel all, plan the next 14 days, at most 400) after any data change (debounced) and when the app returns to the foreground. That's simpler than tracking individual notifications, and it's always consistent. They're planned on the real clock, not the dev clock offset.
- The reminder time is picked in 15-minute steps. Notification permission is requested when a reminder is first switched on, never at launch.
- Android package: `com.alishershayakhmetov.taskcounter`. The EAS `preview` profile builds an APK; `production` builds an app bundle.

### Phase 3: pace, streaks, backup
- **Pace** (counter screen), for goals with a bounded window and something left to do:
  - A **total goal with an end date**: the window runs from the start date to the end date.
  - A **weekly or monthly quota**: the window is the current week or month, cut at the end date if that comes first.
  - Daily quotas and total goals without an end date have no pace line. For a daily quota, "left" already says it all.
  - **Need per day** = remaining ÷ days left including today, rounded up (to whole minutes for time goals). On the last day it reads "Need 24 today".
  - **Ahead / behind** compares the total with an even spread up to the **start** of today: target × days before today ÷ days in the window. So you're never "behind" just because the day has begun. It says "on pace" when the difference is under one unit.
- **Streaks**:
  - Repeating goals count consecutive **met periods**: days, weeks or months. Rest days in a weekday mask are skipped and don't break the streak.
  - Total goals count consecutive **days with a positive net amount**.
  - The current period (today, this week, this month) extends the streak once it's met but doesn't break it while it's still in progress.
  - Periods are counted from the start date, or from the first entry if that's earlier, to today or the end date.
  - The counter screen shows the current and best streak. An ended task shows only its best.
  - A Home card shows a 🔥 badge for active tasks with a current streak of 2 or more.
- **Backup** (Settings):
  - **Export** writes one JSON file (`tally-backup-YYYY-MM-DD.json`) and opens the share sheet (Drive, Telegram, email, Files).
  - The file holds every task and entry, including soft-deleted ones, plus the settings. It leaves out `local_date` (a derived cache) and the running stopwatch (local state).
  - **Import** picks a file and **merges** it:
    - Rows are matched by ID, and a row is replaced only when the file's `updated_at` is newer. Deletions count as edits, so a mistaken entry deleted on another phone stays deleted.
    - Importing the same file twice changes nothing.
    - The whole file is validated before anything is written, and applied in one transaction, so a bad file changes nothing.
    - Afterwards `local_date` is re-derived for every entry under the phone's cutoffs.
    - A summary shows what was added and updated.
- **Done when:** unit tests cover pace (window edges, the last day, time rounding, the end date inside a week), streaks (rest days, the in-progress period, gaps, week and month runs) and backup (round trip, validation, merge rules). The merge SQL runs in Jest against the real migrations.
  - On the phone: export, reinstall the app (or clear its data), import, and every task is back with its history. Importing again reports nothing new.
  - Consequence (accepted with the merge choice): deleting a task on this phone is newer than any earlier backup, so importing that backup doesn't bring the task back. A "replace everything" restore would, if it's ever wanted.

### Phase 4: statistics
- A **Statistics** screen per task, opened from the counter screen next to "All history". Tasks have different units, so there's no screen that combines them.
- **Tiles:**
  - Total, and the best day with its date.
  - Average per active day: the net total ÷ days with a positive amount.
  - Active days, counted since the first entry.
  - Best streak, with the current one underneath.
  - For repeating goals, the share of periods met. The period in progress counts only once it's met, so the rate doesn't drop every morning.
  - For total goals, progress toward the target instead.
- **Bar chart:**
  - Ranges are the last 30 days, 12 weeks or 12 months. It opens on the goal's own period.
  - A goal line is drawn when the bars measure that period, and the caption explains it.
  - Net-negative periods draw below zero. Axis ticks are clean steps (1-2-5 for counts, whole minutes or hours for time).
  - Tapping or dragging across the plot picks a bar, and a readout shows its period and amount, with ✓ when the goal was met.
  - Each bar has a screen-reader label, and "Show as a table" lists every period.
- **Calendar heat map:**
  - A month of days in four steps of the task's colour. With a daily goal, the strongest step means "met"; otherwise it's the month's best day. A day with nothing, or a net loss, is neutral.
  - Months go from the first entry to today. Tapping a day shows its amount.
- Charts are plain React Native views (no chart library, works in Expo Go). Marks follow the dataviz rules:
  - Bars are at most 24 px, with a 2 px gap, 4 px rounded at the value end, on hairline gridlines.
  - Mark colours reach 3:1 against the card. The slate task colour is lightened in dark mode.
  - The four calendar steps pass the ordinal-ramp checks for all 8 task colours in both themes. The strongest step moves away from the surface: 10% darker in light mode, 30% lighter in dark.
- **Done when:** unit tests cover summaries, goal rate (rest days, the period in progress), bar series (week start, month and year boundaries), axis steps (negative values, time), heat levels, and the colour ramp. On the phone the screen scrolls smoothly, and dragging across the chart doesn't fight the page scroll.

### Phase 5: order, templates, notes
- **Reorder** (Home): a **Reorder** link above the active tasks (when there are 2 or more) switches to compact rows with **Move up / Move down** buttons, disabled at the ends. Finished/Archived sections and the New task button are hidden until **Done**.
  - A move gives only the moved task a new `sort_order`, the midpoint between its new neighbours (or one past the end). One changed row keeps future sync merges small.
  - If two neighbours share a value, or floating point runs out of room, the list is renumbered and only rows whose value changes are written.
- **Templates** (New task): "Start from a template" lists a blank option and 8 built-in starters, translated into EN/RU:
  - 100 push-ups a day, 1000 squats in 30 days, 8 glasses of water a day, run 20 km a week, plank 5 min a day, read 20 pages a day, cycle 300 km a month, meditate 10 min a day.
  - Picking one fills the form (name, unit, icon, colour, goal, target, buttons, deadline), and everything stays editable.
  - The form reloads through a reset key rather than remounting, so the picker keeps its scroll position.
- **Notes on entries:** an optional `note` (≤ 140 characters, whitespace collapsed, empty means none). Editing it bumps `updated_at`, so backup merges (and later sync) carry it.
  - **Where:** "ADD NOTE" on the Undo bar right after logging, a note field in Enter amount, tapping any recent entry on the counter screen (add, edit or remove), and the History edit dialog (amount and note together).
  - **Quick chips:** the user's most recent distinct notes first, then built-in suggestions ("Felt tired", "New record", "Felt great", "Short on time"). Tapping a chip fills the note; tapping it again clears it.
  - Notes show in italics under the entry on the counter screen and in History.
  - **Backups:** notes are included. Files from before Phase 5 have no `note` and still import, as null. That's why the format number stays 1.
- **Done when:** unit tests cover note normalisation and suggestions, every move case (edges, gaps, ties, 200 halvings of one gap), and that every template fills a valid form in both languages. The SQL tests run migration 0003 and import a note.
  - On the phone: reorder survives a restart, a template creates a working task, and a note added from the Undo bar shows in History.

### End-to-end tests (Maestro), added 2026-10-02
- Maestro flows in `.maestro/` drive the **release APK** on a local Android emulator (`tally_e2e`, Android 36, x86_64). They cover templates, counting, Undo, typed amounts, notes, reorder (including surviving a restart), statistics and settings, and since Phase 6 tap mode, the Today summary and the countdown. Each flow clears app data first, so they're independent.
- `npm run e2e:build` (`scripts/e2e-android.mjs`) does three things:
  - Runs `expo prebuild` if `android/` is missing (it's gitignored, and `package.json` is restored afterwards).
  - Builds `assembleRelease` for the connected device's ABI only: about 1 min incrementally, versus 12 min for all four ABIs.
  - Installs the APK with adb.
- `E2E_GOOGLE_CDN=1` routes Google's Maven through Google's alternate CDN. On the development machine, `dl.google.com` ran at ~25 KB/s and the CDN at ~500 KB/s.
- **Decisions found while running them:**
  - Maestro waits for the UI to settle between commands, so taps land more than 2 s apart and don't merge. Merging is left to the unit tests, and Undo is tested on a typed amount, which never merges.
  - The Undo bar covers the bottom links for 4 s, so flows wait for it before tapping them.
  - The New task form no longer focuses the Name field on open. With templates above the form, an immediate keyboard covered half the screen, and Maestro's `hideKeyboard` acted as Back when no keyboard was up.
  - The emulator must use the GPU (`-gpu host`). With software rendering, adb lost the device between flows ("device offline").
- Not in CI: GitHub's runners would need an emulator. An EAS Workflow with a `maestro` job is the cloud option if wanted.

### Phase 6: quick logging and overview, added 2026-10-03
- **Countdown** (time goals): the timer panel has a **Stopwatch / Countdown** switch.
  - The length starts at what's left today for a daily goal (the whole target once it's met), the pace line's per-day need for goals that have one, and 10 minutes otherwise. −1 min / +1 min change it, and tapping the time opens a dialog to type `5`, `1:30` or `1:05:00`. The range is 1 s to 24 h.
  - The chosen mode and a typed length are remembered per task while the app runs, not across restarts.
  - It's the same persisted timer as the stopwatch, with the length stored on `active_timer.countdown_ms` (migration 0004). It's local state, so it's never synced or backed up.
  - **At 0:00** it alerts and **keeps counting as overtime** (`+0:12`, in the success colour). Stop logs the whole elapsed time, so holding a plank longer still counts. Stopping early logs what was done.
  - **The alert** is a notification on its own "Timers" channel, so reminders can be muted separately:
    - The re-plan that runs after every data change also schedules the alert for the countdown's end. Pausing, stopping or discarding re-plans, which cancels it.
    - Without the exact-alarm permission, Android may deliver a scheduled notification minutes late. So while the app runs, a JS timer posts the alert at 0:00 itself, after cancelling the scheduled one, and skips it if one is already showing.
    - An alert more than 5 s overdue (the app was asleep) is left to the scheduled notification.
    - Stopping or discarding the countdown dismisses a "time's up" notification that's still showing.
  - Notification permission is asked the first time a countdown starts. If it's denied, the panel says there will be no sound, and the screen only shows overtime (plus a vibration if Vibration is on).
  - Home's timer banner shows the time left or the overtime.
- **Tap mode** (count goals): a "Tap mode" button next to "Enter amount…" opens a screen where the whole coloured area is a **+1** button.
  - Every tap goes through the counter screen's logic, so taps within 2 s merge into one entry, and the goal-reached vibration works.
  - It shows the task, **this set** (net taps since opening the screen), and the current period's progress. The screen stays on.
  - A −1 button below the area logs a −1 (its own entry, as on the counter screen). Done goes back.
  - One tap is always +1, whatever the task's buttons are.
- **Today summary** (Home, above the cards): "3 of 5 daily goals done", or "All 5 daily goals done" in the success colour.
  - It counts **active daily goals with a quota today**. Weekly, monthly and total goals have no fixed amount for today, and a rest day has no quota, so they're left out.
  - It's shown once there are **2 or more** such goals; with one, it would only repeat that card. It's hidden while reordering.
  - One segment per goal, in Home order, filled with the task's colour (nudged to 3:1 against the card) once met. The screen-reader label lists the goals still to do.
- **Do it again** (counter screen of a finished task, on the "This task ended" banner) opens New task pre-filled from that task, without the template row.
  - Everything is copied (name, icon, colour, goal, buttons, weekdays, cutoff, reminder). The end date keeps the original length: a 30-day challenge again runs 30 days from today.
  - The finished task stays under Finished with its history.
- **Done when:** unit tests cover the countdown (time left rounding, overtime, pauses moving the end, the default length, ± steps and typed lengths), the Today summary (which goals count, the minimum of 2), the restart end date (month and leap-year ends), the new plural key, and migration 0004.
  - **Checked on the emulator (2026-10-03):** Maestro flows 05 (tap mode, Today summary) and 06 (countdown into overtime), plus by hand:
    - The 0:00 alert posted within about 0.1 s with the app open, and about 1.1 s late from the scheduled notification with the app in the background.
    - Stopping dismisses the alert.
    - "Do it again" was checked by moving the emulator's date past a 30-day challenge: the copy ran Nov 3 to Dec 2.
  - **Found on the device:**
    - The countdown-length dialog renders inside the counter screen's ScrollView. With the default `keyboardShouldPersistTaps`, the first tap on Set only closed the text keyboard (time entry uses the full keyboard), so the screen's ScrollView now uses `"handled"`.
    - Entries logged by either timer mode are tagged "timer" rather than "stopwatch".

### Later (explicitly **not** in v1)
| Feature | Why deferred |
|---|---|
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
9. The app is called **Tally** in every language. Its icon is white tally marks (four strokes crossed by a fifth) on the app's blue, `#2563EB`; the master is `assets/icon.svg`. Internal identifiers keep the old name: the slug `task-counter` (the EAS project is linked to it), the Android package `com.alishershayakhmetov.taskcounter` (the signing key is registered for it, and a new package would install as a separate app), the URL scheme `taskcounter`, and the database file `task-counter.db` (renaming it would orphan existing data).
