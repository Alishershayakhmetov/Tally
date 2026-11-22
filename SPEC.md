# Tally: Specification

> Status: **Phases 0–11 built** (unit tests, 8 Maestro flows on an Android emulator, 19 end-to-end checks of the Windows app; not yet run on a real phone or against the real Dropbox) · Drafted 2026-09-29 · Rev. 2 same day (week start setting, negative counters, day-start setting) · Rev. 3 (per-task day start, history re-groups when a cutoff changes)
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
  note             TEXT             -- optional, ≤ 2000 chars (Phase 5, migration 0003; 140 until 2026-11-23)
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

### 6.3 Sync-readiness rules (followed from day one; sync built in Phase 9)
1. **Client-generated UUIDs**, no autoincrement IDs, so rows created offline on two devices never collide.
2. **`updated_at` on every row, `deleted_at` tombstones instead of hard deletes**, so a sync layer can compute "what changed since X" and propagate deletions.
3. **Counters are sums of an append-mostly entry log**, not a stored number. Two devices logging +10 each merge to +20 with no conflict. A stored `count = 50` would need conflict resolution.
4. **Task edits** (rename, change target) resolve by last-write-wins on `updated_at` when sync arrives. That's acceptable for settings-like data.
5. All DB access goes through a small **repository layer** (`src/db/repos`). Sync later hooks in there, not in screens.
6. **Derived values are never synced.** That covers `local_date` and all totals. A second device recomputes them from the immutable `occurred_at` / `utc_offset_min` and its own settings. The per-task cutoff is a normal task field (last-write-wins). Whether the global default and week start should sync as account preferences is decided in the sync phase.

Backend choice was deferred to the sync phase. Phase 9 chose **the user's own Dropbox**: no server or accounts of our own, and the merge rule is the backup's. The global settings (cutoff, week start, theme, language, vibration) sync like any other row, last-write-wins.

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
- **Reorder** (Home): a **Reorder** link above the active tasks (when there are 2 or more) switches to compact rows with **Move up / Move down** buttons, disabled at the ends. Finished/Archived sections and the New task button are hidden until **Done**. *(Replaced by drag and drop in Phase 8; the move rule below still applies.)*
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
- **Task description (added 2026-11-23, asked for as "a note on the task, not on entries"):** `tasks.description` (migration 0005, nullable text, up to 2000 characters, same normalisation as notes: line breaks kept, runs of spaces collapsed).
  - **Form:** a multiline field under the name (minimum height 96, scrolls after 220). `ValidTaskForm.description` is null when blank.
  - **Task page:** a card between the counter and the buttons, only when there is a description. Short ones show in full; long ones (`isLongNote`) show a two-line preview (line breaks run together) and "Show all ›", which opens the same `NoteSheet` as the entry notes, titled with the task's name. The sheet's top edge is the bottom of the counter block, so the number stays in view. Its button is **Edit task**.
  - **Backup and sync:** `BackupTask.description`, validated (null or text up to 2000) and listed in `LATER_FIELDS`, so a file without it imports as null; the SQL upsert carries it, and a newer `updated_at` wins like any task field. A Tally without this field ignores it (`pick` copies only the fields it knows), so such a device shows no description and won't pass it on, but doesn't fail. Format number stays 1. (Long entry notes are different: an older Tally rejects a file with a note over 140 characters.)
  - **Checked** in the Windows app: filled in the form, previewed, opened in the sheet, reopened in the Edit form with the text intact. Tests: form validation, backup with and without the field, SQL round trip. Not run on a phone yet.
- **Long notes (added 2026-11-23):** the 140-character limit became 2000, and line breaks are kept (runs of spaces collapse, at most one blank line in a row).
  - **Preview:** a note longer than 80 characters or with a line break (`isLongNote`) shows two lines and "Show all ›" on the counter screen and in History. Shorter notes show in full, as before. Long notes are not offered as quick chips (over 40 characters or several lines).
  - **The sheet** (`NoteSheet`, a transparent `Modal` animated by Reanimated, 340 ms up, 240 ms down; instant with reduce-motion): it rises from the bottom and its top edge is the bottom of the counter block (measured with `measureInWindow`), so the number and its progress bar stay in view and the rest of the task is covered. History has no counter, so its sheet starts about a third down. Scrim, Close, Back and a tap outside close it; **Edit note** closes it and opens the editor (History: the amount dialog). Width is capped at 720 like the rest of the desktop layout.
  - **Editor:** the note field is multiline (Enter makes a new line, so there's no submit-on-Enter), shows a length counter past 80 characters, and scrolls inside after 160 px.
  - **Compatibility:** the backup and sync validators accept 2000, so a file with a long note is rejected as invalid by a Tally older than this change. The format number stays 1.
  - **Checked** in the Windows app against an imported long note: preview, sheet position under the counter, mid-animation, Close, Edit note. Not run on a phone yet.
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

### Phase 7: home-screen widgets, added 2026-10-03
- **One widget, "Tally", on both platforms**, showing the **first active tasks on Home** (`domain/widget.ts`): 1 row on a small widget, up to 3 on a larger one. Reordering Home chooses them, so there's no per-widget setup. Neither platform could offer the same per-widget task picker: iOS widget options are fixed when the app is built.
  - Each row: icon and name, "60 / 100 pages · today" (✓ once met; "Rest day" on a rest day), a progress bar in the task's colour, and a **+** button.
  - **+ adds the task's smallest + button**: +1 for most templates, +5 for squats, +1 min for time goals. A task with only − buttons has no +.
  - Tapping a row opens its task (`taskcounter://task/<id>`). With no active tasks the widget says so, and tapping it opens the app.
  - Rows are built as plain data in `features/widget/snapshot.ts`, translated and with numbers ready to show, because the iOS widget can't run the app's code.
- **Android** (`react-native-android-widget` 0.22):
  - **Drawing:** its own primitives, with light and dark variants. The row count follows the widget's height (56 dp per row).
  - **Updates:** a headless task handler (`widgets/androidTaskHandler.tsx`) runs when a widget is added, resized, refreshed (`updatePeriodMillis`, every 30 min, which also covers day rollover) or tapped. It opens the database and sets the language itself, since the app may be closed.
  - **+** is logged right away with the counter's merge rule (presses within 2 s, same day, one entry), then the handler re-plans reminders, because a met quota skips today's reminder. While the app runs, every data change redraws placed widgets.
  - **Loading:** the library throws on import without its native module (Expo Go), so `widgets/index.android.ts` only requires it once `TurboModuleRegistry` has the module. The app entry is now `index.ts`, which loads Expo Router's entry and registers the handler.
- **iOS** (`expo-widgets`, SwiftUI through `@expo/ui`; small and medium sizes):
  - **Runtime:** the widget is a `'widget'`-directive function that Babel compiles to a string. It runs in the widget extension with only SwiftUI components, modifiers and plain JavaScript, so formatting is inlined there.
  - **Data:** the app pushes a **timeline**: snapshots for now and the next three day boundaries (the earliest cutoff among the shown tasks), so "today" resets without the app running.
  - **+** (iOS 17+): a press returns new widget props with the press appended (`{ taskId, at, amount }`). The runtime keeps them and redraws with no app process, and the widget adds pending presses made since each row's period start.
  - **When the app runs** (start, foreground, any data change, or a widget-interaction event while it's alive), it reads every timeline entry's presses, logs the new ones grouped by the counter's merge rule at their original times, then replaces the timeline with no pending presses.
  - **Accepted:** a press made between that read and the replace is lost (a few ms); reminders don't see presses until the app runs.
  - **App config:** `ios.bundleIdentifier` is now `com.alishershayakhmetov.taskcounter`, which expo-widgets needs for the widget target and its App Group.
- Widget presses are stored as `button` entries, so backups need no new source value.
- `expo-widgets` also has an undocumented `enableAndroid` option, not used: the SDK 57 docs list iOS only.
- **Done when:** unit tests cover the + step, which tasks show, rows per height, and grouping kept presses (merge window, interleaved tasks, the day boundary, time amounts, malformed presses).
  - Checked without a device: typecheck, lint, the app config evaluating with both plugins, and the iOS widget compiling to a string that uses only names its runtime provides.
  - **Android, checked on the emulator (2026-10-03):**
    - Added from the launcher's widget picker. It shows the first three Home tasks, in light and dark mode.
    - With the app process killed, three quick presses logged one merged +3 entry and redrew the widget, and +1 min on a time goal logged 60 s.
    - A change in the app redraws the widget, and tapping a row opens its task.
  - **iOS:** not built: it needs a Mac, or an EAS iOS build with an Apple Developer account.
  - **Found on the device:**
    - `expo-widgets` is also autolinked on Android, and its Glance dependency brought `work-runtime-ktx` 2.7.1, which clashed with `work-runtime` 2.8.1 (duplicate classes). The app uses `expo-widgets` only on iOS (on Android its JS is a stub), so `package.json` excludes it from Android autolinking (`expo.autolinking.android.exclude`).
    - React Compiler rewrote the Android widget component and added a hook. The library calls components as plain functions, so the render failed with "Invalid Hook Call", and the widget file now opts out with `'use no memo'`.
    - React Native's Gradle plugin ignores folders named `android/` or `ios/` when deciding whether to rebuild the JS bundle, so edits to the widget files at first shipped stale code. The widget files now live directly in `src/widgets/` (`AndroidWidget.tsx`, `androidTaskHandler.tsx`, `IosWidget.tsx`).
    - A widget row's deep link on a cold start opened the task with nothing underneath, so Back left the app. The root layout now sets `unstable_settings.anchor = 'index'`, so Home is always below.

### Phase 8: order, icons, colours, keyboard (user feedback), added 2026-10-11
- **Drag and drop** replaces the Reorder mode: hold a card on Home for 350 ms, then drag it (`react-native-sortables`, `Sortable.Grid` inside the Home scroll view, which auto-scrolls near the edges).
  - On drop, `moveTo(from, to)` gives only the moved task a new `sort_order` between its new neighbours, the Phase 5 rule generalised from one step to any distance. Ties or exhausted precision renumber.
  - A tap still opens the task. Cards in the grid use `Sortable.Touchable` so taps don't fight the drag gesture.
  - Screen readers get "move up / move down" accessibility actions on each card instead of dragging.
  - The vibration on pick-up follows the Vibration setting. A short hint under the list ("Hold a card to drag it…") shows once there are 2 or more active tasks.
  - The root layout now wraps the app in `GestureHandlerRootView`. Modals with gestures (the colour picker) wrap their content in their own root, since a modal is a separate window on Android.
- **Icons:** the quick row keeps the 10 built-ins, and **More…** opens `EmojiPickerDialog`.
  - It has about 230 emoji in 9 categories (`domain/emoji.ts`), all Emoji 12 or older, so Android 10 and later draws them.
  - **Typed emoji:** a field takes any emoji typed or pasted from the keyboard. `normalizeEmoji` accepts a short string containing an emoji (Extended_Pictographic, flags, keycaps) and rejects plain text. It falls back to a looser check if the JS engine lacks Unicode property escapes.
  - Icons stay plain emoji strings, so badges, widgets and backups are unchanged. The typed field sits at the top of the dialog, so the keyboard doesn't cover it.
- **Any colour:** a **+** swatch opens `ColorPickerDialog` (`reanimated-color-picker`).
  - It has a saturation/brightness panel, a hue slider, the built-in colours as swatches, and its own HEX field, which applies a colour as soon as six hex digits are typed.
  - Colours are stored as `#RRGGBB` (`normalizeHex`), the format backups already validate. A custom colour gets its own selected swatch.
  - **Readability on any colour:** text on a filled task colour uses `textOn(color)` (white unless near-black reads better; every built-in colour keeps white). Progress bars and outlines in the task colour go through `visibleOn` (3:1 against the card), like chart marks.
- **Keyboard:** the task form is a `KeyboardAwareScrollView` (`react-native-keyboard-controller`, the library Expo recommends; it's in Expo Go in SDK 57) under a `KeyboardProvider`. A focused field is scrolled above the keyboard with 96 dp to spare, so the counter-button preview under the field stays visible.
- **Done when:** unit tests cover `moveTo` (any distance, drops in place, ties), the emoji catalog (no duplicates, every category, every emoji accepted), `normalizeEmoji`, `normalizeHex`, and `textOn` (white on all built-ins, readable on light custom colours).
  - **Checked on the emulator (2026-10-11):** 7 Maestro flows pass. New flow 07 covers the icon picker and a HEX colour; flow 03 now covers the order, the hint and a tap that still opens the task.
  - **By hand:** dragging the third card to the top (`adb shell input draganddrop`) moved it and survived a restart. The buttons field stayed above the keyboard with its preview. A light yellow (`#FFE066`) gave dark text on buttons and readable outlines.
- **Found on the device:**
  - The colour preview's text was hidden with `fontSize: 0`, which crashes Android ("FontSize should be a positive value"); it uses the library's `hideText` instead.
  - The library's HEX widget lost typed text (the cursor landed mid-text and its 7-character limit cut the input), so the dialog has its own field.
  - On the test emulator, every app launch (even the previous commit) stayed on the splash screen after the device date had been changed: the splash fade-out never finished. Setting the global animation scales again fixed it, and it didn't come back. It's an emulator state, not an app bug, and the README notes the fix.

### Phase 9: time units, pace in seconds, sound, Dropbox sync (user feedback), added 2026-10-12
- **Time in a unit:** every typed time (Enter amount, editing an entry, the countdown length, a time goal's target) gets a stacked `DurationUnitPicker` above the field: **h:mm:ss format** (the old input: `25` minutes, `m:ss`, `h:mm:ss`), **Hours**, **Minutes**, **Seconds**.
  - It's the segmented control turned vertical: four labels don't fit one row on a phone.
  - In a unit, the field takes a plain number with a dot or a comma (`1,5` for Russian keyboards) and an optional sign, rounded to whole seconds (`parseDurationIn`). The keyboard is the decimal pad; the ± button gives the sign.
  - Switching units keeps a typed number as it is (it now means the new unit). A time with colons (an entry being edited) converts when the new unit shows it with at most two decimals (`1:30:00` → `1.5` hours), otherwise it stays as typed (`switchDurationUnit`).
  - New error codes `numberInvalid` / `numberNotPositive` for a unit's number. The form keeps `targetUnit` next to `target`; a saved task always reopens in the format.
  - The amount dialog now sits in a `KeyboardAvoidingView` (keyboard-controller follows the modal's own window) and scrolls inside the card, since the picker makes it taller than the space above the keyboard.
- **Pace in seconds:** for time goals the need per day is rounded up to the second (was: up to the minute), and ahead/behind is in whole seconds (under one second counts as on pace, as under one unit does for counts).
- **Sound:** reminders and the countdown alert set `sound: true`, each platform's standard sound: iOS's default alert sound, and on Android the channel's sound. The channels are created without a `sound`, which gives the phone's default notification sound (`Settings.System.DEFAULT_NOTIFICATION_URI`), changeable per channel in system settings. SDK 57 already played the default on both platforms when `sound` was unset; this makes it explicit. No sound files ship with the app.
- **Dropbox sync** (Settings → Dropbox sync):
  - **Sign-in:** OAuth 2 code flow with PKCE (S256) and `token_access_type=offline`, in the system browser (`expo-web-browser`'s auth session), redirecting to `taskcounter://dropbox-auth`. The app key is public and no secret ships. `+native-intent.tsx` stops Expo Router from treating the redirect as a screen. The refresh token is kept in `expo-secure-store`; the 4-hour access token only in memory, refreshed when it's within 5 minutes of expiry, and once more if Dropbox refuses it early.
  - **The file:** `/tally-sync.json` in the app folder, the backup format (format 1) as compact JSON. A round: download (with its `rev`), merge with `importBackup` (the backup rule), and upload only if the file lacks a row or holds an older version (`remoteIsBehind`), with `mode: update` on that `rev` (`add` when there was no file). A conflict starts the round over, up to 3 times. A file that fails validation or is from a newer format is never overwritten.
  - **When:** on launch, on returning to the foreground (unless synced in the last 30 s), 5 s after the last local change, and on going to the background with changes not yet up. One sync runs at a time; a request during one runs right after it. The merge's own data change doesn't trigger another sync.
  - **Errors** show under the section: offline, Dropbox revoked the app (the connection is forgotten), missing permissions, rate limit, damaged or newer file. Disconnect revokes the token and keeps the phone's data and the file.
- **Done when:** unit tests cover `parseDurationIn`, `switchDurationUnit`, unit-aware amount/target/countdown parsing, pace in seconds, `remoteIsBehind`, the sync round with two in-memory devices and a fake Dropbox (both-way merge, later edit wins, deletions, no upload when nothing changed, a conflict in the middle, giving up, never overwriting a bad file), the HTTP client against a faked `fetch` (authorize URL, code exchange, refresh revoked, download/not found, upload modes and conflict, error kinds), PKCE (RFC 7636 test vector, base64url), and the redirect hook.
  - **Checked on the emulator (2026-10-12):** 8 Maestro flows pass. New flow 08 types amounts as seconds and hours, checks the format still works, and sets a countdown length and a target in a unit.
  - **By hand:** in Russian, Minutes with `1,5` added +1:30. A weekly Plank goal showed "Need 9:40/day · 19:08 ahead of pace" (minute rounding would have said 10:00 and 19:00). `dumpsys notification` shows both channels (`reminders`, `timers`) with `content://settings/system/notification_sound`.
  - **Dropbox, as far as it goes without signing in:** Connect opens the system browser (a Chrome custom tab). A redirect with the wrong state brings the app back to Settings with "Couldn't connect Dropbox", not to a blank screen. Backing out of the browser returns quietly. Dropbox accepts the app key (a fake code gets `invalid_grant`, not `invalid_client`). Its authorize page answers `invalid_redirect_uri` until `taskcounter://dropbox-auth` is added in the App Console. **Sign-in and sync with a real account haven't been run**: that needs the account owner to sign in.
- **Found on the device:**
  - The stacked picker made the amount dialog taller than the space above the keyboard, which pushed Add out of view. The buttons are now pinned to the bottom of the card, the field sits under the title, and the unit choice under the field (the task form uses the same order).
  - Maestro lost the first typed character when the keyboard was switching from the number pad back to letters; the flow taps the field first. A person can't type that fast.
  - The backup's `exportedAt` was UTC with a `Z` ("…T10:00:00.000Z"), which read as a wrong clock on a phone at +05:00. It's now the phone's local time with its offset (`2026-10-12T15:00:00+05:00`), the same instant, and old files still import (the field is only checked to be text).
  - The counter's screen-reader label read a time total in seconds ("Total 2010"); it now reads it as shown (33:30).

### Phase 10: Windows app, added 2026-10-12
- **Decision:** the app's own web build in an Electron window, not a rewrite or React Native Windows. Everything but the storage and the Dropbox sign-in is shared with the phone. Windows x64 only; the same code would run elsewhere but isn't packaged.
- **Layout:** `desktop/` has its own `package.json` (electron 44, electron-builder, better-sqlite3 13), kept out of the Expo project's dependencies. `main.js` + `src/` (main process), `preload.js` (the bridge), `scripts/build-web.mjs`, `build/icon.png`. The Expo side has `src/desktop/` (`bridge.ts`, `sqlite.ts`).
- **Web build:** `expo export --platform web` with `TALLY_DESKTOP=1`, into `desktop/web/`. The window serves it from `app://tally/` through `protocol.handle` (a single-page app: unknown paths without an extension fall back to `index.html`), with a Content-Security-Policy (`script-src 'self'`, no network access of its own).
- **SQLite:** `expo-sqlite` on web (alpha) is broken (README, Known limitations), so Metro swaps it for `src/desktop/sqlite.ts` when `TALLY_DESKTOP=1` (`resolver.resolveRequest`, web only).
  - The stand-in offers what Drizzle's expo-sqlite driver and the app use: `openDatabaseAsync`, `prepareSync` / `executeSync` / `executeForRawResultSync`, `runSync`, `getAllSync`, `execSync` / `execAsync`. Each call is one **synchronous IPC** (`ipcRenderer.sendSync` in the preload) to the main process, which runs it on better-sqlite3 and returns the rows whole. The app's synchronous query style, `useLive`, repositories and migrations are untouched.
  - **Integer binding:** better-sqlite3 binds a JS number that isn't an int32 as REAL. Whole numbers are bound as BigInt, so `occurred_at / 1000` and `created_at` stay integer arithmetic and typed INTEGER. Named parameters lose their `:`/`@`/`$` prefix, as better-sqlite3 wants.
  - Statements are cached by SQL text (up to 300). WAL is switched on in the main process.
  - The preload answers `{ value }` or `{ error }` for every call, so a failing statement throws in the page instead of hanging it.
- **Dropbox on the desktop:** the sync engine, the Dropbox client and PKCE are shared. What differs is behind two platform files (`env.web.ts`, `platform.web.ts`; the phone's are `env.ts`, `platform.ts`):
  - **Secrets:** the refresh token goes to the main process, encrypted with Windows' DPAPI (`safeStorage`) into `secrets.json` in the user data folder.
  - **Sign-in:** a custom URL scheme would need registry entries from an installer, so the redirect is `http://localhost:53682/dropbox-auth`. The main process listens on 127.0.0.1 (and `::1` if available) for one request that has `code` or `error`, answers a small "you can close this tab" page (English and Russian), and hands the URL to the page, which checks `state` as on the phone and exchanges the code. The sign-in times out after 5 minutes, a Cancel button stops it, and an occupied port is reported. The page is opened in the default browser with `shell.openExternal`, and only for `https://www.dropbox.com/oauth2/authorize?…`.
  - **Requests:** made by the main process (`net.fetch`), only to `api.dropboxapi.com` and `content.dropboxapi.com`, so the page needs no CORS and no network access of its own.
  - The Dropbox App Console needs the second redirect URI (README).
- **Mouse and keyboard (found by the first real use of the app, 2026-10-13):**
  - **Reordering:** hold-to-drag (350 ms, cancelled by any move beyond 5 px) doesn't suit a mouse: people press and pull in one motion, so nothing happened unless the card was held still for about half a second. On web the Home grid uses `customHandle`: each card has a handle (a six-dot grip, `Sortable.Handle`) on its left edge, `dragActivationDelay` 0 and a huge `dragActivationFailOffset`, so a drag starts at once however fast the pointer moves. The card body no longer drags and a click still opens it. A phone keeps the long press. Keyboard: Alt+↑ / Alt+↓ on a focused card moves it (`onKeyDown`, which react-native-web passes on although React Native's types lack it); Enter opens it through the browser's own click on the card's `<button>` (a handler of ours opened it twice). The hint text on Home says so (`home.dragHintHandle`).
  - **Sideways rows:** the template picker and the icon categories were horizontal ScrollViews, which a wheel can't move. `HorizontalScroll` (`.web.tsx`) shows the scrollbar and turns the wheel's vertical movement into sideways scrolling, leaving the wheel alone at either end so the page behind still scrolls.
  - **Off-centre content:** a classic scrollbar takes about 9 px on the right of a scrolling page, so everything centred on it (the emoji, total, goal text) sat 4–5 px left of the window's centre. The window's CSS reserves the same room on the left (`scrollbar-gutter: stable both-edges` on react-native-web's `overflow-y: auto` class, `.r-1rnoaur`), and the centre is now within 0.3 px. Tried and dropped: Chromium's Fluent overlay scrollbars (the switch made the scrollbar wider, not overlaid).
  - **Header button against the edge (found 2026-11-02, taking README screenshots):** on web the stack header leaves its right button (Home's Settings, a task's Edit) flush with the window's edge, where the native header pads it. Both now carry a `marginRight` of `spacing.lg` on web only; the centring check in `desktop/e2e` also asserts the gap is at least 12 px (it was 0).
  - `npm run e2e` in `desktop/` covers all of these.
- **Other differences:** the Settings screen hides Vibration on web. Backup export opens the system's Save As window through the main process and is cancellable (`shareBackupFile` now returns whether it saved). Settings' notifications row says the phone app is needed. Content is a centred column up to 720 px. `overDrag="vertical"` keeps a dragged card inside the single column: on web the card otherwise centred itself under the pointer and slid out of the list.
- **Safety:** `contextIsolation`, `sandbox`, no Node in the page, navigation limited to `app://tally/` (other `https` links open in the browser), every permission request denied, a single-instance lock, and every IPC handler checks that the caller's frame is `app://tally/`.
- **Data:** always `%APPDATA%/Tally` (`task-counter.db`, `secrets.json`), whether run from source or installed.
- **Build:** `npm run dist` in `desktop/` gives `Tally-Setup-<version>.exe` (NSIS, per user, choice of folder) and `Tally-<version>-portable.exe`, 110–120 MB each. `npmRebuild` is off: better-sqlite3 ships a prebuilt N-API binary for win32-x64, so no compiler is needed (none is installed here). The `.node` file is unpacked from the asar. Not code-signed.
- **Not in this phase:** reminders and the countdown alert (Windows notifications need a scheduler that lives while the app runs, plus a tray), widgets, auto-update, code signing.
- **Done when:** the Windows window's behaviour is checked by `desktop/e2e/run.mjs` (11 checks, below), and the app's real Drizzle layer, migrations and repositories pass through the stand-in and better-sqlite3 in Jest (`src/desktop/__tests__/sqlite.test.ts`: migrate, integer typing, named parameters re-grouping entries, a two-device import in one transaction, a rollback on a foreign-key failure, binding rules). It is skipped where `desktop/node_modules` is missing.
  - **Checked in the window (2026-10-12, driven over the debugging port with Playwright):** creating tasks from templates, counting, data kept after a restart, drag-to-reorder with the mouse, the icon and colour pickers, the unit picker in the amount dialog, export (the file's `exportedAt` is local time with the offset) and import, the Dropbox sign-in up to the exchange of a made-up code (Dropbox's own `invalid_grant` came back through the main process), a wrong `state` refused, Cancel closing the local server, requests to other hosts refused, the encrypted secrets round trip, and a 1280 px wide window. The packaged `Tally.exe` (from `win-unpacked`) was run too: it loaded from the asar, opened the database through the unpacked binary, and kept data across a restart.
  - **Not checked:** sign-in and sync with a real Dropbox account (needs the account owner), the installer itself (not installed on this PC), and SmartScreen's behaviour.
- **Found on the way:**
  - A heredoc with quotes made the shell fail on a long file, so the main-process files were written with the editor tool instead.
  - Drag on web centred the card under the pointer; fixed with `overDrag="vertical"`.
  - The packaged app's data folder would have depended on how it is started (Electron names it after `package.json`), so it's set explicitly.

### Phase 11: encrypted sync, added 2026-10-13
Asked for: a password; all synced data encrypted with a key from it; an empty field means no encryption; a button whose window explains the function and what to do with the previous files.

- **The button** is **Encryption…** in Settings → Dropbox sync (**Enter password…** while the cloud file needs one). Its window (`EncryptionDialog`) has three faces:
  - **set:** a password and its repeat, an explanation, and what becomes of the file already in Dropbox, depending on what's there now (`inspectCloud`: none, plain, or unknown/offline). With encryption on, it's change (new password) or turn off (both fields empty; the button says so and turns red).
  - **enter:** the cloud file is encrypted and this device has no (or an old) password. One field. A wrong password is refused and nothing is stored.
  - **reset ("I forgot the password"):** replace the cloud file with this device's data, under a new password or none.
- **What happens to the previous file** (the part the request left to me):
  - A plain `tally-sync.json` is **read and merged first, then replaced in place** by the encrypted one under the same name, with the usual revision check. Nothing from other devices that only the cloud holds is lost.
  - Dropbox's own **version history keeps the earlier plain versions** (30 days or more, plan dependent; the API can't purge them outside Dropbox Business), so the window says they stay readable until they expire and where to delete them.
  - **Exported backups** are separate files and unchanged; the window says they aren't encrypted. An encrypted Export is a possible later feature.
  - **Other devices** are blocked, not broken: they stop with a message instead of overwriting anything, and each needs the password once.
  - **Turning it off** merges the encrypted file and writes a plain one. Older versions in Dropbox's history stay encrypted, and open with the password of their time.
- **Cryptography** (`domain/syncCrypto.ts`, `domain/bytes.ts`), all plain JS from the audited `@noble/ciphers` and `@noble/hashes`, so the phone, the Windows app and the tests run the same code:
  - **Key:** scrypt (RFC 7914) of the NFKC-normalised password, N = 2^14, r = 8, p = 1, a random 16-byte salt, 32 bytes. The cost travels in the file header, so it can be raised later; a file may not ask for more than 64 MiB or less than N = 2^12. Checked against Node's own scrypt.
  - **Cipher:** XChaCha20-Poly1305 (24-byte random nonces, no nonce-reuse worries; constant-time in JS). The data is cut into 64 KiB chunks so a large history is sealed and opened in slices with the app responsive.
  - **Envelope** (format 2; the plain sync file is format 1, so an older Tally says "written by a newer Tally" and leaves it alone): `{ "app":"tally", "format":2, "encrypted": { cipher, kdf, N, r, p, salt, chunk, chunks:[base64(nonce ‖ ciphertext ‖ tag)] } }`. Each chunk authenticates the whole header, its index and the chunk count, so a changed parameter or a swapped, dropped, repeated or truncated chunk is detected.
  - **One salt per password**, constant across uploads: the derived key is kept on the device, so the slow derivation runs once, when the password is entered. The file never changes salt unless the password does, which is also how another device notices a changed password.
  - **Measured in Hermes** (Android emulator, release build): scrypt 2^12 0.9 s, 2^14 3.7 s, 2^15 7.3 s; sealing 719 KiB 0.23 s, opening it 0.30 s (about 3 MB/s). A phone is slower, so 2^14 is the default. `TextEncoder`, `TextDecoder` and `String.normalize` exist there; the by-hand UTF-8 fallbacks are tested anyway.
- **What a device remembers** (`EncryptionRecord`, in the keystore beside the Dropbox token: expo-secure-store, or DPAPI in the Windows app; never in the database, which is exported): the derived key, not the password. Two keys: `current` (what the cloud file is sealed with) and `target` (what it should be). A change sets `target`; when a sync has left the cloud file in that form, `current` catches up. So an interrupted change just runs again. `replace` marks "start over". A half-readable record is reported as damaged, never read as "encryption off" (that would upload a plain file).
- **The sync round** (`engine.ts`, `SyncPolicy { read, write, replace }`):

  | The cloud file is | This device | Result |
  |---|---|---|
  | none | any | upload in the `write` form |
  | plain | no key | merge, upload in the `write` form (turning encryption on re-seals it even if nothing else changed) |
  | plain | expects encryption | **stop: `cloudNotEncrypted`**, nothing merged (anyone with write access could plant a plain file); unless it is turning encryption off |
  | encrypted, salt matches a key | has it | decrypt, merge, upload only if needed |
  | encrypted | no key | **stop: `passwordRequired`**, nothing touched |
  | encrypted, salt differs | has an old key | **stop: `passwordChanged`** |
  | encrypted, salt matches but the data won't open | has the key | `fileInvalid`, never overwritten |
  | anything, `replace` set | any | ignore its content, overwrite (against the revision just downloaded) |

  After a stop that needs a decision, automatic syncs wait (`blocked`); **Sync now** or any of the resolving actions tries again. Disconnecting forgets the key.
- **Password rules:** empty means none; otherwise 8 to 256 characters, typed twice; compared after NFKC so the same word typed on another keyboard gives the same key. (The minimum is my choice, not asked for.)
- **Done when:** 47 new unit tests: base64 and UTF-8 against Node, scrypt against Node's, sealing and opening from empty to many chunks, every kind of tampering, malformed or oversized envelopes, and the encryption record (`phase11.test.ts`, `encryption.test.ts`, `encryptionRecord.test.ts`); the engine run with two in-memory devices through every transition above, including a racing upload and starting over.
  - **Windows app, end to end (2026-10-13):** `desktop/e2e` now runs two app instances against a **fake Dropbox** (`e2e/fakeDropbox.mjs`, which answers as Dropbox's documented API does, reached through `TALLY_TEST_DROPBOX_ORIGIN`): plain sync, turning encryption on (the file in "Dropbox" shows none of the task names, and its history still holds the plain version, as the window says), a second device asked for the password and refusing a wrong one, changes both ways with the same salt, changing the password, turning it off, a device told its cloud file isn't encrypted, starting over, disconnecting. 19 checks pass, from source and as the packaged `Tally.exe`. The fake is not real Dropbox: the real sign-in and real uploads are still untried.
  - **Android (emulator):** the window renders; with the keyboard open the field scrolls into view and the pinned error and buttons stay above the keyboard; the key derivation, its saving in the keystore and the closing of the window ran end to end. The 8 Maestro flows pass. A connected account isn't available there, so the sync part runs only in unit tests and the Windows app.
- **Found on the way:**
  - `KeyboardAwareScrollView` turned the first tap on a pinned button into "close the keyboard" on Android, so a tap on Encrypt did nothing; the dialog uses a plain ScrollView and scrolls to its fields itself, like the amount dialog.
  - The error line sat under the fields, below the visible part once the keyboard was open, so a mismatch looked like a dead button. Errors and progress are now pinned above the buttons.
  - A scrypt cost of 2^15 took 7.3 s in Hermes on the emulator, hence 2^14.
- **Not done:** an encrypted Export; a password strength meter; changing the cost on existing files; and trying real Dropbox.

### Later (explicitly **not** in v1)
| Feature | Why deferred |
|---|---|
| Reminders and widgets on Windows, other desktops | Phase 10 is Windows x64 only, with no reminders. macOS / Linux would need packaging, and notifications need a long-running scheduler. |
| Background sync, other clouds | Phase 9 syncs through Dropbox while the app runs. Syncing with the app closed (background tasks), or through Google Drive / iCloud, would be separate work. |
| Combined goal ("1000 total **and** 50/day") | Doubles the progress UI complexity. Revisit if it's actually wanted. |
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
