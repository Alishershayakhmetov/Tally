# Tally

A local-first mobile app for counting toward self-set goals: _"1000 push-ups"_, _"100 squats"_. Create a task, tap to log progress, and see how far you are from the target. All data lives in SQLite on the device.

Built with Expo SDK 57 (React Native 0.86, TypeScript, Expo Router) and Drizzle ORM over `expo-sqlite`. The full design, decisions and phased plan are in [SPEC.md](SPEC.md).

## Status: Phases 0–5

**Counting (Phase 0)**

- Counter screen: big total, the task's own buttons (default −1, +1, +5, +10), "Enter amount…" for any number (negative numbers correct mistakes), Undo, recent entries (long-press to delete)
- Rapid taps merge into one entry: 50 quick taps of +1 are logged as a single "+50"
- Counters can go below zero. Past the target they show more than 100% and a done state.

**Goals (Phase 1)**

- A task is a **total** ("1000 push-ups") or a **quota per day / week / month** ("8 glasses a day"). Daily quotas can skip weekdays ("Mon/Wed/Fri"), and other days show as rest days.
- Optional **deadline / end date**, with "N days left". After it passes, the task moves to **Finished** with its result ("Goal reached", "18 of 30 days met") and becomes read-only. Moving the end date reopens it.
- **Archive** and restore, **edit** every field, delete.
- **History** screen: entries grouped by day with day totals (✓ when a daily quota was met). Tap to edit an amount, long-press to delete.

**Days and settings**

- **New day starts at** (00:00–12:00): a global default, plus an optional per-task override. Logs before the cutoff count for the previous day. Changing a cutoff re-groups past entries (SPEC §3.5).
- **Week starts on**: Auto (from the phone's locale), Monday or Sunday. Weekly quotas re-group immediately.
- **Language**: follows the phone, or English / Русский, including correct Russian plurals ("Остался 21 день", "Выполнено 1 из 21 дня").
- **Theme**: follows the phone, or light / dark. Every text colour is checked for WCAG AA contrast in both themes.
- **Vibration**: off by default. When on, the phone vibrates briefly on every logged change, with a distinct pattern when a goal is reached; switching it on gives a sample buzz. It doesn't affect reminder notifications, which follow Android's settings for the app's notification channel.
- In development builds, Settings has a **clock offset** (+1 h / +1 day) for testing rollover without waiting for it.

**Time and reminders (Phase 2)**

- **Time goals** ("plank 10 minutes a day"): amounts show as `m:ss` / `h:mm:ss`, buttons add minutes, and typed amounts accept `25` (minutes), `1:30` or `1:05:00`.
- **Stopwatch** with pause, resume, stop-and-log and discard. It's stored as timestamps, so it survives the app being backgrounded or killed, and it logs to the day it started. The screen stays on while it runs on the counter screen, and Home shows a banner while one is running. One stopwatch at a time.
- **Reminders** at a per-task time, **skipped when that day's or period's goal is already met** (a total goal: skipped on days you already logged). After every change the app cancels its reminders and plans the next two weeks again, so there's nothing to keep in sync. Tapping a reminder opens its task. Permission is asked for the first time you turn a reminder on, and Settings shows its status.

**Pace, streaks and backup (Phase 3)**

- **Pace** for a total goal with a deadline, or a weekly/monthly quota: "Need 31/day · 37 ahead of pace". Ahead/behind compares your total with an even spread up to the start of today, so the morning never counts as "behind".
- **Streaks**: consecutive met days, weeks or months (rest days don't break them), or consecutive days with anything logged for a total goal. A period still in progress extends a streak but never breaks it. The counter shows current and best; Home cards get a 🔥 badge from 2 in a row.
- **Backup** in Settings. **Export** writes one JSON file (every task and entry, including deletions, plus settings) and opens the share sheet, so it can go to Drive, Telegram or email. **Import** merges a file into the phone: rows are matched by ID and the newer edit wins, so importing the same file twice changes nothing. The whole file is validated first and applied in one transaction, so a damaged file changes nothing. Because a deletion counts as an edit, a task deleted on the phone after the export stays deleted.

**Statistics (Phase 4)**

- A **Statistics** screen per task (from the counter screen):
  - **Tiles:** total, best day, average per active day, active days, best streak, and either the share of days/weeks/months met or progress toward the target.
  - **Bar chart** of the last 30 days, 12 weeks or 12 months, with the goal as a line. Tap or drag to read a bar; every bar has a screen-reader label, and the data is also available as a table.
  - **Calendar heat map:** each day shaded in the task's colour; with a daily goal, the strongest shade means the goal was met.
- The charts are plain views, with no chart library. Their colours are checked in tests: every task colour reaches 3:1 as a mark in both themes, and the four calendar shades step evenly away from the card.

**Order, templates and notes (Phase 5)**

- **Reorder** tasks on Home: tap **Reorder**, then use the ↑/↓ buttons, which work with screen readers too. Each move rewrites only the moved task's position.
- **Templates:** New task starts with a row of 8 ready-made goals (100 push-ups a day, 1000 squats in 30 days, 8 glasses of water, run 20 km a week, plank 5 min, read 20 pages, cycle 300 km a month, meditate 10 min). Picking one fills the form, and you can change anything before saving.
- **Notes on entries** ("felt tired", "new record"):
  - Add one from the Undo bar right after logging, while typing an amount, by tapping a recent entry, or in History.
  - Quick chips offer your recent notes and a few suggestions.
  - Notes are included in backups, and older backup files without notes still import.

## Build an installable APK

The `preview` profile in `eas.json` builds a standalone APK in Expo's cloud (free tier). It needs your own Expo account, and it uploads the project to Expo's build servers:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build -p android --profile preview
```

`eas.json` pins the build server to Node 24.13.0 (npm 11), the same versions that write `package-lock.json` locally. With EAS's default (Node 22, npm 10), `npm ci` rejects the lockfile: npm 11 leaves out `@emnapi/core` and `@emnapi/runtime`, which are peer dependencies of an optional WebAssembly package, and npm 10 requires them. If you upgrade Node locally, update the pin to match.

The first build offers to create the EAS project and to generate an Android signing key; accept both. When it finishes, it prints a link and a QR code for downloading the APK to the phone. The Android package is `com.alishershayakhmetov.taskcounter` (in `app.json`); change it before any store release if you want a different one.

## Run it on your Android phone

1. Install **Expo Go** from the Play Store.
2. Install dependencies and start the dev server:

   ```bash
   npm install
   npx expo start
   ```

3. Scan the QR code in the terminal with Expo Go. The phone and PC must be on the same Wi-Fi network.

If the phone can't connect (Windows Firewall often blocks port 8081), use a tunnel instead:

```bash
npx expo start --tunnel
```

## Scripts

| Command               | What it does                                              |
| --------------------- | --------------------------------------------------------- |
| `npm start`           | Start the Expo dev server                                 |
| `npm test`            | Jest unit tests                                           |
| `npm run typecheck`   | `tsc --noEmit`                                            |
| `npm run lint`        | ESLint (Expo config + Prettier)                           |
| `npm run format`      | Format with Prettier                                      |
| `npm run db:generate` | Generate a SQL migration after editing `src/db/schema.ts` |
| `npm run e2e:build`   | Build a release APK and install it on the emulator        |
| `npm run e2e`         | Run the Maestro end-to-end flows in `.maestro/`           |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check and tests. It also fails if the schema changed without a migration, and it bundles the app for Android.

## End-to-end tests (Maestro)

The flows in `.maestro/` drive the real release APK on an Android emulator:

| Flow                         | What it checks                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `01_count_and_undo.yaml`     | Create a task from a template, +1 taps, a typed amount and its Undo, Home's progress              |
| `02_notes.yaml`              | ADD NOTE from the Undo bar, chips, the note in History, editing it there, removing it             |
| `03_reorder.yaml`            | New tasks go last, Move up, and the order survives closing the app                                |
| `04_stats_and_settings.yaml` | Statistics tiles and ranges, the Vibration switch (off by default), switching to Russian and back |

Each flow starts from cleared app data, so they can run in any order. Shared steps live in `.maestro/subflows/`. Flows use English text and the screen-reader labels the app already has (`Add 10`, `Move Push-ups up`), plus a `testID` where text is ambiguous.

**One-time setup** (Windows paths shown):

1. Android Studio's SDK, plus these SDK packages: `platforms/android-36`, `ndk/27.1.12297006`, `cmake/3.22.1`, `system-images/android-36/google_apis/x86_64`. Use Android Studio's SDK Manager, or `cmdline-tools\latest\bin\sdkmanager.bat`.
2. An emulator: `avdmanager create avd -n tally_e2e -k "system-images;android-36;google_apis;x86_64" -d pixel_7`.
3. [Maestro CLI](https://docs.maestro.dev): unzip a release into `%USERPROFILE%\.maestro` and add `%USERPROFILE%\.maestro\maestro\bin` to `PATH`. It needs Java 17 or newer.

**Run:**

```bash
"%LOCALAPPDATA%\Android\Sdk\emulator\emulator.exe" -avd tally_e2e -gpu host
```

Use the GPU (`-gpu host`). With software rendering (`swiftshader`), the emulator lost its adb connection between flows ("device offline").

```bash
npm run e2e:build
```

```bash
npm run e2e
```

`e2e:build` generates `android/` (gitignored) with `expo prebuild` if it's missing, builds `assembleRelease`, and installs the APK with `adb`. Add `--clean` after `app.json` or plugin changes. The first build takes a while because Gradle downloads its dependencies; later builds are incremental.

If downloads from `dl.google.com` are slow on your network, set `E2E_GOOGLE_CDN=1`. Gradle then fetches Google's Maven artifacts through Google's alternate CDN (`scripts/google-cdn.init.gradle`): same artifacts and publisher, different host.

## How it works

```text
src/
  app/          screens (Expo Router): index, settings, task/new, task/[id]/{index,edit,history,stats}
  domain/       pure TypeScript, no React/Expo: days, periods, goals, progress, tap merging,
                input validation (error codes, not English text), settings parsing
  db/           Drizzle schema, database client, repositories, re-grouping SQL, useLive()
  features/     screen logic: useCounter, task view models, goal text, the task form, backup, stats charts
  i18n/         en.json, ru.json, i18next setup, date and error formatting
  lib/          clock (with dev offset), theme hooks, contrast, week start, haptics
  notifications/ reminder scheduling on top of the pure planner in domain/reminders.ts
  components/   shared UI: cards, dialogs, calendar, segmented control, steppers
drizzle/        generated SQL migrations, bundled into the app
assets/         icon.svg (the icon master) and the PNGs exported from it: launcher, adaptive
                foreground and monochrome, notification, splash, favicon
```

- **A count is never stored.** Each change is an entry with a signed amount, and the total is the sum of entries. Undo and history come for free, and future cloud sync can merge two devices without conflicts (SPEC §6.3).
- **Entries keep the moment they were logged and the device's UTC offset.** The day an entry belongs to (`local_date`) is a cache derived from those, so changing a cutoff re-groups history with one SQL statement and never touches `updated_at`. The TypeScript function and its SQL twin are tested against each other on 5,000 random inputs, and the re-grouping statements run in Jest against real SQLite with the actual migrations.
- **Periods are pure date arithmetic** on `YYYY-MM-DD` strings (weeks, months, weekday masks, leap years), so daylight-saving changes can't shift a day.
- **Soft deletes and client-generated UUIDs** throughout, so the local data is ready for sync later.
- The database is opened asynchronously once at startup (migrations run then). After that, queries are synchronous, and screens re-read through `useLive()` whenever a repository writes.
- **Reminders are planned, not polled.** A local notification can't run code when it fires, so "skip if the goal is met" is decided in advance by a pure planner (`domain/reminders.ts`, tested across cutoffs, weekday masks, weeks, months and a DST change). Progress can only change inside the app, and every change re-plans.

## Known limitations

- **Web is not supported.** `expo-sqlite` 57.0.3's web build (alpha) truncates any synchronous result longer than 255 bytes: `web/WorkerChannel.ts` writes the result length with `Uint8Array.set(new Uint32Array([length]))`, which keeps only `length % 256`. Android and iOS use the native module and aren't affected. The Metro `wasm` setting and the cross-origin headers in `app.json` are kept for when this is fixed upstream. Web also needs cross-origin isolation, which `npx expo start` doesn't currently send.
- Verified so far in a browser (with that bug patched locally) and by unit tests. **Not yet run on a real phone**, so Android-only behaviour is unconfirmed: notifications firing, haptics, keeping the screen on, the system dark-mode switch, and `Intl.PluralRules` on Hermes (polyfilled if missing).
- **Reminders** don't exist on web. On Android they use inexact alarms, so they can arrive a few minutes late (exact alarms need a special permission that Android 14 denies by default). They're planned two weeks ahead, so if the app isn't opened for two weeks, they stop until it is.
- Header actions ("Settings", "Edit") are text buttons; no icon set is installed.
