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
- **Fewer boxes.** Cards are borderless surfaces a step lighter than the page.
  They separate by tone and space, not by outlines.

## Tokens

| Token | Dark | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0a0b0c` | `#f3f4f1` | Page |
| `--surface` | `#141517` | `#ffffff` | Cards, sheets, tab bar |
| `--surface-2` | `#1e2023` | `#eceee9` | Inputs, chips, inner blocks |
| `--text` | `#f2f3f1` | `#111311` | Primary text |
| `--muted` | `#9a9ca3` | `#5d6159` | Secondary text |
| `--faint` | `#64676e` | `#979b93` | Hints, inactive icons |
| `--accent` | `#ff4d4d` | `#d61f2c` | The one action or value per screen |
| `--on-accent` | `#1a0505` | `#ffffff` | Text on accent fills |
| `--pr` | `#ffb020` | `#b45309` | Personal records, over-target |
| `--danger` | `#ff6b6b` | `#cc3333` | Delete, errors |

Contrast (WCAG AA): light red is 4.6:1 on the page and 5.1:1 under white
button text. Dark red is 6:1 on graphite and takes near-black button text (6:1),
because no single red clears 4.5:1 both as text on graphite and under white
text. Destructive actions share the red hue; their labels say what they do.

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

Every animation answers "what changed?". All of it collapses to instant under
`prefers-reduced-motion`.

- **Launch splash.** The barbell assembles (bar, then plates slam on), the
  wordmark rises, then the whole screen lifts away like a rep. It plays once
  per cold start, never on tab changes.
- **Page enter.** Each tab fades up 8px and its sections stagger in 40ms
  apart, so you see where the content came from.
- **Progress fills.** Bars grow from zero when they appear, so the number
  reads as progress, not a static graphic.
- **Press.** Buttons and chips compress to 0.96 on press.
- **Tab bar.** The red pill slides to the tab you picked (Motion shared layout).
- **Haptics.** Logging a set and finishing a workout tick the phone (ios-haptics on iPhone, the vibration API elsewhere).
- **Launch.** iPhone launch images are the splash's first frame (plain graphite), so there is no white flash before it plays.

UI motion animates only `transform` and `opacity`. The exceptions are the protein ring's stroke (a paint-only 92px SVG) and the two WebGL backdrops.

## Libraries and where they are used

Each one has a single job. Anything heavy loads only where it is used.

| Library | Used for | Where |
| --- | --- | --- |
| GSAP (`@gsap/react`) | Counting numbers up to their new value | `CountUp`: protein card |
| React Bits SplitText (GSAP) | Headline rising in letter by letter | Onboarding welcome |
| React Bits ClickSpark | Red sparks when you log a set | Workout Log button |
| React Bits ShinyText | A sheen across the badge when a PR lands | Workout "New PR" |
| Motion | Tab pill (shared layout), sheet slide and flick-to-dismiss, toast and rest-dock exits; app-wide reduced-motion | App shell, `Sheet`, toasts |
| Sliding Number (motion-primitives, via 21st.dev) | Odometer digits on the rest timer | Rest dock |
| Lenis | Smooth wheel scrolling, desktop only (touch stays native) | App shell |
| Vanta FOG (three.js r134) | Animated red fog backdrop, loaded on demand | Onboarding welcome |
| GetLayers "Soffit" (WebGL2) | Overhead red light behind the launch splash | Splash |

React Bits and Sliding Number are copied into `src/components/` (that is how
both are distributed) with small LiftLog fixes noted in each file.

