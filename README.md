# LiftLog

A gym and nutrition tracker for building muscle while staying lean. It's an installable web app (PWA) for iPhone and laptop. Your data is saved on the device first, so logging works with no signal, and it syncs across devices once you connect Supabase.

Design: [docs/superpowers/specs/2026-10-16-gym-nutrition-tracker-design.md](docs/superpowers/specs/2026-10-16-gym-nutrition-tracker-design.md)

## What it does

- **Workout**: your split rotates in order, so a missed day is never skipped. Each exercise shows last session's numbers, and the next set is pre-filled, so logging takes one tap. The rest timer starts on its own, and PRs are flagged as they happen.
- **Food**: search 150+ common Indian dishes plus packaged foods from Open Food Facts, or scan a barcode. You can log saved meals in one tap and create your own foods.
- **Targets**: calories and protein start from your body stats. Every two weeks your weight trend is checked and calories are nudged up or down by 100–150 kcal. You can undo any change.
- **Progress**: weekly-average body weight against your goal pace, an estimated 1-rep max trend per lift, and protein and calorie hit days.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. Other commands: `npm test` runs the logic tests, `npm run build` makes a production build, and `npm start` serves that build. The service worker only runs in production builds.

## Put it on your iPhone

1. Deploy (below) so the app has an `https://` address.
2. Open it in **Safari**, tap **Share**, then **Add to Home Screen**.
3. Open it from the home screen. Safari can clear data for sites that aren't installed, so always use the home-screen app.

## Deploy to Vercel (free)

1. Push this folder to a GitHub repository.
2. At vercel.com, choose **Add New → Project**, import the repo, and keep the defaults.
3. Optional: add the sync keys below as environment variables, then redeploy.

## Turn on sync (Supabase, free)

Without these keys the app works fully on one device. To sync your phone and laptop:

1. Create a project at supabase.com.
2. In **SQL Editor**, run [supabase/migrations/0001_user_records.sql](supabase/migrations/0001_user_records.sql). It creates one table, with row-level security so each person can only see their own data.
3. In **Authentication → Sign In / Providers**, turn off **Confirm email** and save. LiftLog signs in with email and password inside the app. An emailed link would open in Safari instead of the home-screen app, and Supabase's default email can't carry a code without your own SMTP server.
4. In **Project Settings → API Keys**, copy the project URL and the publishable (anon) key into `.env.local` (and into Vercel's environment variables):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

5. Restart or redeploy. Create your account under **Settings → Account** on one device, then sign in with the same email and password on the others.
6. For **Delete account**, run [supabase/migrations/0002_delete_account.sql](supabase/migrations/0002_delete_account.sql) in the SQL Editor too. Without it, Delete account still erases your synced data but leaves the login itself.
7. For **Forgot password?**, add your app's `/reset` page (for example `https://your-app.vercel.app/reset`, and `http://localhost:3000/reset` for local testing) under **Authentication → URL Configuration → Redirect URLs**, and set **Site URL** to the app's address. The reset email opens in Safari: you set a new password there, then sign in with it in the app. Supabase's built-in email sends only a few messages an hour.

On a new device, sign in on the welcome screen **before** you set it up. If you set it up first, you'll end up with two copies of your split.

## How it's built

- Next.js 16 (App Router) + TypeScript + Tailwind 4, rendered on the client. The server only sends the app shell and proxies food lookups.
- Dexie (IndexedDB) holds all your data. Each write is also queued in an outbox that [src/lib/sync.ts](src/lib/sync.ts) pushes to Supabase, and conflicts are resolved by last write wins.
- Food data:
  - Indian dishes: [src/lib/data/indian-foods.ts](src/lib/data/indian-foods.ts), typical home-recipe values.
  - Packaged foods: Open Food Facts, through [src/app/api/foods](src/app/api/foods).
- Logic with tests: targets and auto-adjust ([src/lib/targets.ts](src/lib/targets.ts)), rotation, PRs, and pre-fill ([src/lib/workout-logic.ts](src/lib/workout-logic.ts)), and food search ([src/lib/food-search.ts](src/lib/food-search.ts)).
