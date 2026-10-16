import type { PlannedExercise, SplitDay } from "../types";

const ex = (exerciseId: string, sets: number, repMin: number, repMax: number): PlannedExercise => ({ exerciseId, sets, repMin, repMax });

// One focused session per muscle group, startable on any day. Each opens with
// a heavy compound, then fills out the muscle from other angles, for roughly
// 12–16 hard sets.
export const MUSCLE_ROUTINES: { muscle: string; blurb: string; exercises: PlannedExercise[] }[] = [
  {
    muscle: "Chest",
    blurb: "Flat, incline, and a stretch-focused fly",
    exercises: [ex("bench-press", 4, 6, 10), ex("incline-db-press", 3, 8, 12), ex("chest-press-machine", 3, 10, 12), ex("cable-fly", 3, 12, 15), ex("dips", 2, 8, 12)],
  },
  {
    muscle: "Back",
    blurb: "Vertical and horizontal pulls for width and thickness",
    exercises: [ex("pull-up", 3, 6, 10), ex("barbell-row", 3, 6, 10), ex("lat-pulldown", 3, 8, 12), ex("seated-cable-row", 3, 10, 12), ex("face-pull", 2, 12, 20)],
  },
  {
    muscle: "Shoulders",
    blurb: "A press, then plenty of side and rear delt work",
    exercises: [ex("overhead-press", 4, 6, 10), ex("lateral-raise", 4, 12, 20), ex("cable-lateral-raise", 2, 12, 20), ex("rear-delt-fly", 3, 12, 20), ex("shrug", 2, 10, 15)],
  },
  {
    muscle: "Legs",
    blurb: "Quads, hamstrings, glutes, and calves",
    exercises: [ex("squat", 4, 5, 8), ex("romanian-deadlift", 3, 6, 10), ex("leg-press", 3, 10, 15), ex("leg-curl", 3, 10, 15), ex("leg-extension", 2, 12, 15), ex("calf-raise", 4, 10, 15)],
  },
  {
    muscle: "Arms",
    blurb: "Biceps and triceps, alternating",
    exercises: [ex("close-grip-bench", 3, 6, 10), ex("barbell-curl", 3, 8, 12), ex("overhead-triceps-ext", 3, 10, 15), ex("hammer-curl", 3, 10, 12), ex("triceps-pushdown", 3, 10, 15), ex("preacher-curl", 2, 10, 15)],
  },
  {
    muscle: "Core",
    blurb: "Flexion, anti-extension, and a hold",
    exercises: [ex("hanging-leg-raise", 3, 8, 15), ex("cable-crunch", 3, 10, 15), ex("ab-wheel", 3, 6, 12), ex("plank", 3, 30, 60)],
  },
];

export const MUSCLE_DAY_PREFIX = "muscle:";

// Muscle routines behave like split days on the workout screen but aren't
// stored, so starting one never moves your rotation.
export const MUSCLE_DAYS: SplitDay[] = MUSCLE_ROUTINES.map((r, i) => ({
  id: `${MUSCLE_DAY_PREFIX}${r.muscle.toLowerCase()}`,
  name: `${r.muscle} day`,
  order: 1000 + i,
  exercises: r.exercises,
  updatedAt: 0,
}));

export const muscleDay = (id: string | null | undefined) => (id ? MUSCLE_DAYS.find((d) => d.id === id) : undefined);
