# LiftLog design

A one-person gym and nutrition tracker you use mid-set with a sweaty thumb. The
design should feel like a native athletic app: dark first, one loud accent, big
numbers, and motion that explains what just happened.

## Direction

- **Red on graphite.** A near-black graphite canvas and a single high-contrast
  red accent. Red marks the one thing to do or look at on each screen: the
  next set, protein still to eat, the active tab. Nothing else is coloured,
  except amber for PRs.
- **Numbers are the hero.** Weights, reps, grams and kcal are set large, tight
  and tabular. Labels and explanations stay small and quiet.
- **Liquid Glass (web approximation).** Cards, controls, sheets and toasts
  are a glass material over a slow ambient light (red, ember and cool blobs
  drifting behind every page). Apple's Liquid Glass is a native iOS material
  with no official web version; this approximates it with `backdrop-filter`
  blur and saturation, a translucent tint, a 1px rim, a bright inner top edge
  and a specular sheen.

## Tokens

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0a0b0c` | `#f3f4f1` | Page |
| `--surface` | `#141517` | `#ffffff` | Cards, sheets, tab bar |
| `--surface-2` | `rgb(255 255 255 / .07)` | `rgb(17 19 17 / .055)` | Inputs, chips, inner blocks (translucent) |
| `--text` | `#f2f3f1` | `#111311` | Primary text |
| `--muted` | `#9a9ca3` | `#5d6159` | Secondary text |
| `--faint` | `#80838b` | `#737770` | Hints, inactive icons |
| `--accent` | `#ff4d4d` | `#d61f2c` | The one action or value per screen |
| `--on-accent` | `#1a0505` | `#ffffff` | Text on accent fills |
| `--pr` | `#ffb020` | `#b45309` | Personal records, over-target |
| `--danger` | `#ff6b6b` | `#cc3333` | Delete, errors |

Contrast (WCAG AA): light red is 4.6:1 on the page and 5.1:1 under white
button text. Dark red is 6:1 on graphite and takes near-black button text (6:1),
because no single red clears 4.5:1 both as text on graphite and under white
text. Destructive actions share the red hue; their labels say what they do.

## Glass

| Class | Used for | Tint (dark / light) |
| --- | --- | --- |
| `.card`, `.glass` | Content cards (24px) | `rgb(30 31 34 / .55)` / `rgb(255 255 255 / .62)` |
| `.glass-control` | Tab bar, rest dock (pill) | stronger tint |
| `.glass-thick` | Sheets, toasts | stronger tint, 30px blur |

- Blur is 22px with 170% saturation. Inner blocks (`--surface-2`) are
  translucent fills without their own blur, because stacked blurs are expensive.
- A scroll edge at the top softens content as it slides under the status bar,
  as on iOS.
- Contrast measured on glass, worst case over the ambient light: body text
  12.5:1 dark / 14.4:1 light, muted text at least 4.87:1, faint hints at least 3.5:1.
- Fallbacks: no `backdrop-filter` support, `prefers-reduced-transparency` or
  `prefers-contrast: more` turn the glass into solid surfaces with a visible
  rim and hide the ambient light.

## Shape

One rule, used everywhere:

- Containers (cards, sheets): **24px**.
- Blocks inside a container (inputs, stat tiles, lists): **16px**.
- Anything you tap that isn't a list row (buttons, chips, segmented
  controls, the tab bar): **full pill**.

## Type

Barlow Condensed (athletic display) with Geist and Geist Mono, all via
`next/font`. The condensed face is the UI/UX Pro Max recommendation for
fitness products.

| Role | Face / size / weight |
| --- | --- |
| Page title (`.title`) | Barlow Condensed 40px / 700, uppercase |
| Hero number (`.display`) | Barlow Condensed 72px / 700, tabular |
| Section heading | Geist 17px / 600 |
| Body | Geist 15px / 400 |
| Label (`.label`) | Geist 13px / 500, muted |

## Motion

Native and quick, never decorative. Every animation answers "what changed?",
and all of it collapses to instant under `prefers-reduced-motion`.

- **Launch.** The mark settles in (320 ms), then the screen zooms gently
  past into the app (240 ms), like an iPhone app opening. The iOS launch
  image is the same plain graphite, so there is no flash.
- **Tabs.** Switching tabs is a 140 ms crossfade, with no staggered entrances.
  Deeper pages (History, Your split) push in from the right with the iOS curve.
- **Tab bar.** The red pill slides to the tab you picked (Motion shared
  layout, a stiff spring).
- **Sheets, toasts, rest dock.** Motion springs in and out, and sheets follow a
  flick's velocity.
- **Numbers, rings and bars** move only when the value changes (for example
  after you log food). Nothing counts up on every visit.
- **Press.** Buttons and chips compress to 0.96 on press (80 ms).
- **Haptics.** Logging a set and finishing a workout tick the phone.
- **Ambient light** behind the glass is still on purpose: light moving under
  blurred glass forces a re-blur every frame and stutters on phones.

Removed on purpose, because they read as generated and cost frames: a
letter-by-letter headline, WebGL fog and gradient backdrops, spark bursts,
badge sheens, staggered page entrances and smooth-scroll hijacking.

## Libraries and where they are used

| Library | Used for | Where |
| --- | --- | --- |
| Motion | Tab pill, sheets (slide and flick), toasts, rest dock, number roll, app-wide reduced motion | App shell, `Sheet`, toasts, `CountUp` |
| Sliding Number (motion-primitives, via 21st.dev) | Odometer digits on the rest timer | Rest dock |
| ios-haptics | System haptic on Log set and Finish workout | Workout |

GSAP, Lenis, Vanta/three.js, React Bits and the GetLayers WebGL gradient were
removed in the animation rework.

## Steps

A Steps card on the Workout screen (below the session) shows today against the goal (Settings →
Steps, 6k–12k), with a 7-day bar chart and calories walked. Steps are typed
in, or sent by an iPhone Shortcut. The Shortcut reads Health, sums today's
steps and opens `/steps?count=N`. That opens in Safari, which saves and syncs
the count, so the home-screen app needs sync. Steps live in their own record
per day (`<date>:steps`), so a count from Safari can't overwrite that day's
water.

## Demo

"Try the demo" on the welcome screen loads four weeks of sample data
straight into the local database, skipping the sync queue so it can never
upload. A banner offers "Start fresh", which wipes the device. Sync sign-in
is off during the demo.

## Coach

An AI coach answers questions from the person's own
data and turns "2 rotis and dal for lunch" into a food proposal that is only
logged when they tap Log (with Undo). The chat stays on the device.

- A floating button (bottom right, every screen) opens it in a sheet; `/coach`
  still shows it full screen. The button appears only when `/api/assistant` says the signed-in account is
  allowed. The server checks the Supabase session and requires the email to be
  on `ASSISTANT_EMAILS`, since replies run on the owner's key. All keys are
  server-only Vercel environment variables. Without them the coach is hidden
  for everyone.
- Provider: Google Gemini's free tier when `GEMINI_API_KEY` is set (model
  `gemini-flash-latest`), otherwise Anthropic with `ANTHROPIC_API_KEY`
  (`claude-haiku-5-5`). `ASSISTANT_MODEL` overrides either. On Gemini's free
  tier Google may use prompts to improve its products.
- The curated food catalogue (never INDB) rides in the system prompt, so the
  coach logs exact values by id when a dish matches and estimates otherwise.
- Each request sends a plain-text summary built by `coachContext()` in
  `src/lib/coach.ts`: today's food, 14 days of totals, weights, the last 8
  workouts, steps and their own foods. It is capped at 16k characters.
