# Task Counter

A local-first mobile app for counting toward self-set goals: _"1000 push-ups"_, _"100 squats"_. Create a task, tap to log progress, and see how far you are from the target. All data lives in SQLite on the device.

Built with Expo SDK 57 (React Native 0.86, TypeScript, Expo Router) and Drizzle ORM over `expo-sqlite`. The full design, decisions and phased plan are in [SPEC.md](SPEC.md).

## Status: Phase 0 (counting core)

- Home: task cards with progress bar, percent and "left" count
- Create a task: name, target, unit label, icon, colour, and its own counter buttons (default −1, +1, +5, +10)
- Counter screen: big total, the task's buttons, "Enter amount…" for any number (negative numbers correct mistakes), Undo, recent entries (long-press to delete), delete task
- Rapid taps merge into one entry: 50 quick taps of +1 are logged as a single "+50"
- Counters can go below zero. Past the target they show more than 100% and a done state.

Not yet built (see SPEC §10): deadlines and recurring quotas, history screen, settings (week start, day cutoff), English/Russian, dark mode, stopwatch, reminders.

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
  app/          screens (Expo Router): index, task/new, task/[id]
  domain/       pure TypeScript, no React/Expo: days, progress, tap merging, input parsing, formatting
  db/           Drizzle schema, database client, repositories, useLive() change notifications
  features/     screen logic (useCounter)
  components/   shared UI
drizzle/        generated SQL migrations, bundled into the app
```

- **A count is never stored.** Each change is an entry with a signed amount, and the total is the sum of entries. Undo and history come for free, and future cloud sync can merge two devices without conflicts (SPEC §6.3).
- **Entries keep the moment they were logged and the device's UTC offset.** The day an entry belongs to is derived from those, so a future "new day starts at 04:00" setting can re-group history with one SQL statement. The TypeScript function and its SQL twin are tested against each other on 5,000 random inputs.
- **Soft deletes and client-generated UUIDs** throughout, so the local data is ready for sync later.
- The database is opened asynchronously once at startup (migrations run then). After that, queries are synchronous, and screens re-read through `useLive()` whenever a repository writes.

## Known limitations

- **Web is not supported.** `expo-sqlite` 57.0.3's web build (alpha) truncates any synchronous result longer than 255 bytes: `web/WorkerChannel.ts` writes the result length with `Uint8Array.set(new Uint32Array([length]))`, which keeps only `length % 256`. Android and iOS use the native module and aren't affected. The Metro `wasm` setting and the cross-origin headers in `app.json` are kept for when this is fixed upstream. Web also needs cross-origin isolation, which `npx expo start` doesn't currently send.
- Verified so far in a browser (with that bug patched locally) and by unit tests. **Not yet run on a real phone.**
