# Task Counter

A local-first mobile app for counting toward self-set goals: _"1000 push-ups"_, _"100 squats"_. Create a task, tap to log progress, and see how far you are from the target. All data lives in SQLite on the device.

Built with Expo SDK 57 (React Native 0.86, TypeScript, Expo Router) and Drizzle ORM over `expo-sqlite`. The full design, decisions and phased plan are in [SPEC.md](SPEC.md).

## Status: Phase 1 (goals, history, settings, EN/RU, dark mode)

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
- In development builds, Settings has a **clock offset** (+1 h / +1 day) for testing rollover without waiting for it.

Not yet built (Phase 2, see SPEC §10): time goals with a stopwatch, reminders, installable APK.

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

CI (`.github/workflows/ci.yml`) runs typecheck, lint, format check and tests. It also fails if the schema changed without a migration, and it bundles the app for Android.

## How it works

```text
src/
  app/          screens (Expo Router): index, settings, task/new, task/[id]/{index,edit,history}
  domain/       pure TypeScript, no React/Expo: days, periods, goals, progress, tap merging,
                input validation (error codes, not English text), settings parsing
  db/           Drizzle schema, database client, repositories, re-grouping SQL, useLive()
  features/     screen logic: useCounter, task view models, goal text, the task form
  i18n/         en.json, ru.json, i18next setup, date and error formatting
  lib/          clock (with dev offset), theme hooks, contrast, week start, haptics
  components/   shared UI: cards, dialogs, calendar, segmented control, steppers
drizzle/        generated SQL migrations, bundled into the app
```

- **A count is never stored.** Each change is an entry with a signed amount, and the total is the sum of entries. Undo and history come for free, and future cloud sync can merge two devices without conflicts (SPEC §6.3).
- **Entries keep the moment they were logged and the device's UTC offset.** The day an entry belongs to (`local_date`) is a cache derived from those, so changing a cutoff re-groups history with one SQL statement and never touches `updated_at`. The TypeScript function and its SQL twin are tested against each other on 5,000 random inputs, and the re-grouping statements run in Jest against real SQLite with the actual migrations.
- **Periods are pure date arithmetic** on `YYYY-MM-DD` strings (weeks, months, weekday masks, leap years), so daylight-saving changes can't shift a day.
- **Soft deletes and client-generated UUIDs** throughout, so the local data is ready for sync later.
- The database is opened asynchronously once at startup (migrations run then). After that, queries are synchronous, and screens re-read through `useLive()` whenever a repository writes.

## Known limitations

- **Web is not supported.** `expo-sqlite` 57.0.3's web build (alpha) truncates any synchronous result longer than 255 bytes: `web/WorkerChannel.ts` writes the result length with `Uint8Array.set(new Uint32Array([length]))`, which keeps only `length % 256`. Android and iOS use the native module and aren't affected. The Metro `wasm` setting and the cross-origin headers in `app.json` are kept for when this is fixed upstream. Web also needs cross-origin isolation, which `npx expo start` doesn't currently send.
- Verified so far in a browser (with that bug patched locally) and by unit tests. **Not yet run on a real phone**, so Android-only behaviour (haptics, the system dark-mode switch, `Intl.PluralRules` on Hermes, which is polyfilled if missing) is unconfirmed.
- Header actions ("Settings", "Edit") are text buttons; no icon set is installed.
