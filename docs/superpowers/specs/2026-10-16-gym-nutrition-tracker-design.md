# Gym workout and nutrition tracker — design

## Context: intent and the why

The user wants to improve themself at the gym and with food. Their goal is to **build muscle while staying lean**. The app is their scoreboard: logging should be fast enough that they keep doing it, and the progress view should show at a glance whether three things are trending the right way:

1. **Strength:** best sets on the main lifts going up.
2. **Body weight:** rising slowly, by weekly average.
3. **Nutrition:** hitting daily protein and calorie targets most days.

It starts as the user's personal tool. The public may use it later, so it must not need a rebuild for that.

## Users and usage

- **One user at first**: the user, who lives in India. Their food is a mix of Indian home cooking, packaged or barcoded items, and eating out.
- They log **on their phone** between sets and at meals, and review **on a laptop**. Both devices show the same data.
- They train on a **fixed split or program** (for example push/pull/legs).
- Their phone is an **iPhone** (user decided). The laptop runs a desktop browser.
- **No history to import.** They start fresh (user decided).
- Weights are in **kg** *(Claude's call)*.

## Goals

**At the gym (user decided):**
- Their split is set up once. Each split day lists exercises, each with target sets and a rep range *(Claude's call)*.
- "Today" is the **next day in the rotation** (user decided). It advances each time a workout is completed, whatever the date, so a missed day skips nothing. The user can pick a different day manually.
- Opening the app shows **today's routine pre-filled**.
- Each exercise shows **last session's weight × reps** so they know what to beat.
- Logging a set is one or two taps. The weight and reps fields default to last time's values.
- A **rest timer** starts automatically after each logged set.
- A **PR alert** fires when a set is a personal best.

**At meals (user decided):**
- **Search a food database** or **scan a barcode** to fill in calories and protein (plus carbs and fat).
- Coverage has to be good for **Indian dishes** (dal, roti, sabzi, paneer and so on), packaged foods, and common restaurant items.
- **Saved meals** ("usual breakfast") can be logged with one tap *(Claude's call)*.
- **Custom foods and recipes** cover home dishes the database doesn't have *(Claude's call)*.

**Targets (user decided):**
- The app **calculates starting calorie and protein targets** from height, weight, age, sex, and activity level.
- It **adjusts the calorie target automatically** when the weekly-average weight isn't rising at the intended lean-gain pace. *(Claude's call on how: re-check every 2 weeks, change by 100–150 kcal at a time, and show a short "why it changed" note. Adjustments go **both ways**: up if weight is flat, and down if weight is rising faster than the lean pace, because staying lean is part of the goal. The user can undo any adjustment or switch auto-adjust off.)*

**Progress (user approved the mockup):**
- A trend for each main lift's best set (or estimated 1-rep max).
- A weekly-average body weight trend, compared against the target pace.
- Days the protein and calorie targets were hit, per week.
- Body weight logged a few times a week, with smoothing so daily swings don't mislead *(Claude's call)*.

**Platforms (Claude's call):** one installable web app (a PWA) that works well on a phone and on a laptop. It syncs through a user account, and **logging works offline** (gym basements often have no signal), syncing when back online.

## Non-goals (v1)

- No social features, sharing, or leaderboards.
- No AI coach or workout program generator. The user brings their own split.
- No push notifications *(Claude's call)*. In-app reminders, shown as banners or cards inside the app, are allowed *(user decided, 2026-10-17)*.
- No native iOS or Android apps.
- No wearable or health-app integrations.
- No micronutrient tracking beyond calories, protein, carbs, and fat.

## Anti-goals: things that would make it a failure even if it works (user decided)

- **Slow logging.** Too many taps, slow search, or long forms. Target: a set in 2 taps or fewer, and a saved meal in 2 taps or fewer.
- **Wrong food numbers.** Missing Indian dishes, or calories that are clearly off.
- **Ads, paywalls, upsells, or nagging.**
- **Cluttered screens.** Each screen shows only what's needed right now.

## Constraints

- It must be able to become a multi-user public product later. So proper sign-in and per-user data isolation are required from day one.
- It must be cheap to run at one user (free tiers).
- The phone layout comes first. The laptop layout is mainly for reviewing progress and managing the split.

## How: what's been decided

Everything below is **Claude's call**. The user handed over the technical choices.

- **App:** Next.js (App Router) + TypeScript + Tailwind, built as a PWA.
- **Backend:** Supabase. It provides Postgres, email/Google sign-in, and row-level security for per-user isolation. The free tier is enough to start.
- **Offline:** an on-device store (IndexedDB) with a queue of pending changes that syncs on reconnect. Workout and food logging must work fully offline. Food *search* may need a connection, but saved meals, recent foods, and custom foods work offline.
- **Food data, layered:**
  1. **Indian Nutrient Databank (INDB)** for cooked Indian dishes per serving, plus **IFCT 2017** for ingredients. Both are imported into the app's own database.
  2. **Open Food Facts** for barcode lookup and packaged foods, queried live and cached.
  3. **USDA FoodData Central** as a fallback for generic whole foods.
  4. **The user's own custom foods, recipes, and saved meals.**
- **Food data source tracking:** every food record stores where its numbers came from (INDB, IFCT, OFF, USDA, or user). The reuse terms for INDB and IFCT are unconfirmed for a public product, so each source must be removable or swappable later without a rebuild.
- **iPhone specifics:** barcode scanning uses a camera-based JS scanner library, because iOS Safari has no built-in BarcodeDetector. iOS can clear storage for sites that aren't installed, so the app prompts the user to add it to the home screen and requests persistent storage. The server is the source of truth: only the unsynced queue lives solely on the device, and the UI shows when something hasn't synced yet. The rest timer is based on clock time, so it stays correct if the app is backgrounded. It alerts with a sound and on-screen signal only while the app is open (no push notifications, per the non-goals).
- **Hosting:** Vercel (free tier). The user creates the Supabase, Vercel, and Google sign-in accounts during the build, with step-by-step guidance, and supplies the keys. Everything runs locally against Supabase until then.
- **Visual direction:** clean, minimal, and calm. Bottom navigation with three tabs (Workout, Food, Progress) plus a settings area. The user approved these mockups:
  - **Workout:** a header like "Today · Push day". For the current exercise: its name, then "Last time: 70 kg × 8, 8, 7". Below that, set rows ("Set 1 · 72.5 kg × 8") with a check once logged, a "New PR" badge where earned, and a Log button on the next set. A large rest timer card, then a one-line "Next: …" list of the remaining exercises.
  - **Food:** progress bars for protein (112 / 150 g) and calories (1,850 / 2,600). A search box with a barcode button next to it. The day's meals as rows (Breakfast, Lunch, Snack, Dinner), each with a short description and its protein grams.
  - **Progress (last 8 weeks):** a small line chart of bench press best set ("62.5 → 72.5 kg"), a small line chart of weekly-average body weight ("68.0 → 69.6 kg · on pace"), and a row "Protein target hit: 5 of 7 days".

## Left to the builder

- The data model and schema details.
- The exact target formulas (for example Mifflin–St Jeor BMR × activity factor + a small surplus; protein around 1.6–2.2 g/kg), the lean-gain pace (around 0.25–0.5% of body weight per month), and the adjustment thresholds within the rules above.
- Whether PRs use the heaviest weight, the most reps at a weight, or estimated 1RM. Pick sensible rules and show them.
- The exercise library: seed a common set and let the user add their own.
- Charting library, component library, and testing approach.
- Restaurant-food coverage beyond the sources above.

## Verification (end-to-end)

- Set up a push/pull/legs split. On a phone-width browser, open "today" and confirm the routine is pre-filled with last session's numbers. Log 3 sets in 2 taps each, see the rest timer start, and beat a previous best to trigger a PR alert.
- Search for "dal", "roti", and "paneer butter masala" and get sensible per-serving values. Scan a packaged product barcode. Log a saved meal in 2 taps.
- On an iPhone with the app installed to the home screen, scan a barcode, then background the app during a rest timer and confirm it shows the correct time when reopened.
- Turn the network off, log a workout and a meal, turn it back on, and confirm both appear on the laptop.
- Enter body stats and check the calculated targets. Seed 3 weeks of flat weight and confirm the calorie target goes up with an explanation. Then seed fast gain and confirm it goes down.
- Sign in as a second test user and confirm none of the first user's data is visible.
