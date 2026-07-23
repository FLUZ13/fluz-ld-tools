import solver, { type SolverModel } from "javascript-lp-solver";
import { DATA, ratingsFor, TIERS, type Assignment, type BuilderState, type Recommendation, type RuneTier } from "../model";

interface VariableMeta {
  runeId: string;
  tier: RuneTier;
  immortalId: string;
  score: number;
  confidence: "source" | "provisional";
}

const variableName = (runeIndex: number, tier: RuneTier, immortalIndex: number) =>
  `r${runeIndex}t${tier}i${immortalIndex}`;

// This sits below rune tier priority and vastly below a one-point meta rating change.
const FAVORITE_TIE_BREAKER = 1_000;

export function optimizeAssignments(state: BuilderState): Recommendation[] {
  const ratings = ratingsFor(state.metaVersion);
  const selected = new Set(state.selectedImmortalIds);
  const favorites = new Set(state.favoriteImmortalIds);
  const inventory = new Map<string, number>();
  const assignments: Assignment[] = [];

  for (const rune of DATA.runes) {
    for (const tier of rune.availableTiers) {
      if (!TIERS.includes(tier)) continue;
      const count = state.inventory[rune.id]?.[tier] ?? 0;
      if (count > 0) inventory.set(`${rune.id}:${tier}`, count);
    }
  }

  const constraints: SolverModel["constraints"] = {};
  const variables: SolverModel["variables"] = {};
  const binaries: Record<string, 1> = {};
  const metadata = new Map<string, VariableMeta>();

  for (const [immortalIndex, immortal] of DATA.immortals.entries()) {
    if (!selected.has(immortal.id)) continue;
    constraints[`slots:${immortal.id}`] = { max: 2 };
    for (const [runeIndex, rune] of DATA.runes.entries()) {
      constraints[`same:${immortal.id}:${rune.id}`] = { max: 1 };
      const rating = ratings[rune.id]?.[immortal.id];
      const score = rating?.[state.mode];
      if (score == null || score <= 0) continue;
      for (const tier of rune.availableTiers) {
        if (!TIERS.includes(tier)) continue;
        const count = inventory.get(`${rune.id}:${tier}`) ?? 0;
        if (count <= 0) continue;
        const copyConstraint = `copy:${rune.id}:${tier}`;
        constraints[copyConstraint] ??= { max: count };
        const name = variableName(runeIndex, tier, immortalIndex);
        const stableTieBreaker = DATA.runes.length - runeIndex + DATA.immortals.length - immortalIndex;
        variables[name] = {
          value: score * 100_000_000 + tier * 100_000 + (favorites.has(immortal.id) ? FAVORITE_TIE_BREAKER : 0) + stableTieBreaker,
          [copyConstraint]: 1,
          [`slots:${immortal.id}`]: 1,
          [`same:${immortal.id}:${rune.id}`]: 1,
        };
        binaries[name] = 1;
        metadata.set(name, { runeId: rune.id, tier, immortalId: immortal.id, score, confidence: rating.confidence });
      }
    }
  }

  if (Object.keys(variables).length > 0) {
    const result = solver.Solve({ optimize: "value", opType: "max", constraints, variables, binaries } as SolverModel & { binaries: Record<string, 1> });
    if (result.feasible) {
      for (const [name, meta] of metadata) {
        if (result[name] !== 1) continue;
        assignments.push(meta);
      }
    }
  }

  return DATA.immortals
    .filter((immortal) => selected.has(immortal.id))
    .map((immortal) => ({
      immortalId: immortal.id,
      assignments: assignments
        .filter((assignment) => assignment.immortalId === immortal.id)
        .sort((a, b) => b.score - a.score || b.tier - a.tier),
    }))
    .sort((a, b) => b.assignments.length - a.assignments.length || a.immortalId.localeCompare(b.immortalId));
}
