import type { PlannedExercise } from "../types";
import { MUSCLE_ROUTINES } from "./muscle-routines";

const routineFor = (muscle: string) => MUSCLE_ROUTINES.find((r) => r.muscle === muscle)!.exercises;

const ex = (exerciseId: string, sets: number, repMin: number, repMax: number): PlannedExercise => ({
  exerciseId,
  sets,
  repMin,
  repMax,
});

export type SplitTemplateId = "ppl" | "upper-lower" | "full-body" | "bro" | "empty";

export const SPLIT_TEMPLATES: {
  id: SplitTemplateId;
  name: string;
  blurb: string;
  days: { name: string; exercises: PlannedExercise[] }[];
}[] = [
  {
    id: "ppl",
    name: "Push / pull / legs",
    blurb: "3 days that repeat. Run it 3 or 6 days a week.",
    days: [
      {
        name: "Push",
        exercises: [
          ex("bench-press", 3, 6, 10),
          ex("overhead-press", 3, 6, 10),
          ex("incline-db-press", 3, 8, 12),
          ex("lateral-raise", 3, 12, 20),
          ex("triceps-pushdown", 3, 10, 15),
        ],
      },
      {
        name: "Pull",
        exercises: [
          ex("pull-up", 3, 6, 10),
          ex("barbell-row", 3, 6, 10),
          ex("lat-pulldown", 3, 8, 12),
          ex("face-pull", 3, 12, 20),
          ex("barbell-curl", 3, 8, 12),
        ],
      },
      {
        name: "Legs",
        exercises: [
          ex("squat", 3, 5, 8),
          ex("romanian-deadlift", 3, 6, 10),
          ex("leg-press", 3, 10, 15),
          ex("leg-curl", 3, 10, 15),
          ex("calf-raise", 3, 10, 15),
        ],
      },
    ],
  },
  {
    id: "upper-lower",
    name: "Upper / lower",
    blurb: "4 days a week, each muscle twice.",
    days: [
      {
        name: "Upper A",
        exercises: [
          ex("bench-press", 3, 5, 8),
          ex("barbell-row", 3, 6, 10),
          ex("overhead-press", 3, 6, 10),
          ex("lat-pulldown", 3, 8, 12),
          ex("db-curl", 2, 10, 15),
          ex("triceps-pushdown", 2, 10, 15),
        ],
      },
      {
        name: "Lower A",
        exercises: [
          ex("squat", 3, 5, 8),
          ex("romanian-deadlift", 3, 6, 10),
          ex("leg-extension", 3, 10, 15),
          ex("calf-raise", 3, 10, 15),
        ],
      },
      {
        name: "Upper B",
        exercises: [
          ex("incline-db-press", 3, 8, 12),
          ex("pull-up", 3, 6, 10),
          ex("db-shoulder-press", 3, 8, 12),
          ex("seated-cable-row", 3, 8, 12),
          ex("lateral-raise", 3, 12, 20),
        ],
      },
      {
        name: "Lower B",
        exercises: [
          ex("deadlift", 3, 3, 6),
          ex("leg-press", 3, 10, 15),
          ex("leg-curl", 3, 10, 15),
          ex("hanging-leg-raise", 3, 10, 15),
        ],
      },
    ],
  },
  {
    id: "full-body",
    name: "Full body",
    blurb: "3 days a week, alternating A and B.",
    days: [
      {
        name: "Full body A",
        exercises: [
          ex("squat", 3, 5, 8),
          ex("bench-press", 3, 5, 8),
          ex("barbell-row", 3, 6, 10),
          ex("lateral-raise", 2, 12, 20),
        ],
      },
      {
        name: "Full body B",
        exercises: [
          ex("deadlift", 3, 3, 6),
          ex("overhead-press", 3, 6, 10),
          ex("lat-pulldown", 3, 8, 12),
          ex("leg-curl", 2, 10, 15),
        ],
      },
    ],
  },
  {
    id: "bro",
    name: "One muscle per day",
    blurb: "5 days: chest, back, shoulders, legs, arms. Core twice a week.",
    days: ["Chest", "Back", "Shoulders", "Legs", "Arms"].map((muscle) => ({
      name: muscle,
      exercises: [
        ...routineFor(muscle),
        // Core rides along on the two shortest days.
        ...(muscle === "Chest" || muscle === "Shoulders" ? routineFor("Core").slice(0, 2) : []),
      ],
    })),
  },
  {
    id: "empty",
    name: "I'll build my own",
    blurb: "Start blank and add your days.",
    days: [{ name: "Day 1", exercises: [] }],
  },
];
