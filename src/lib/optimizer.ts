import solver, { type SolverModel } from "javascript-lp-solver";
import { immortalPriorityWeight } from "../data/immortal-priority";
import { DATA, bisPairFor, ratingsFor, reconcileLockedAssignments, TIERS, type Assignment, type AssignmentSlot, type BuilderState, type Recommendation, type RuneTier } from "../model";

interface VariableMeta {
  runeId: string;
  tier: RuneTier;
  immortalId: string;
  score: number;
  confidence: "source" | "provisional";
  value: number;
}

const variableName = (runeIndex: number, tier: RuneTier, immortalIndex: number) =>
  `r${runeIndex}t${tier}i${immortalIndex}`;

const RATING_WEIGHT = 100_000_000;
const RUNE_TIER_WEIGHT = 100_000;
// Mode usage is a gentle default. A player's favorite star is the stronger personal tie-break.
const MODE_PRIORITY_TIE_BREAKER = 500;
const FAVORITE_TIE_BREAKER = 5_000;
// Completing an exact latest-meta BiS pair beats scalar ties, but never a full rating point elsewhere.
const BIS_PAIR_COMPLETION_BONUS = 25_000_000;
// javascript-lp-solver runs on the UI thread. Pathological MIP branches must never freeze the Builder.
const SOLVER_TIMEOUT_MS = 180;

function greedyFallback(
  metadata: Map<string, VariableMeta>,
  inventory: Map<string, number>,
  occupiedSlots: Map<string, Set<AssignmentSlot>>,
  lockedRuneTypes: Set<string>,
) {
  const selected = new Set<string>();
  const usedCopies = new Map<string, number>();
  const usedSlots = new Map<string, number>();
  const usedRuneTypes = new Set(lockedRuneTypes);
  const candidates = [...metadata.entries()].sort((left, right) => right[1].value - left[1].value || left[0].localeCompare(right[0]));

  for (const [name, meta] of candidates) {
    const slotLimit = 2 - (occupiedSlots.get(meta.immortalId)?.size ?? 0);
    if ((usedSlots.get(meta.immortalId) ?? 0) >= slotLimit) continue;
    const runeTypeKey = `${meta.immortalId}:${meta.runeId}`;
    if (usedRuneTypes.has(runeTypeKey)) continue;
    const copyKey = `${meta.runeId}:${meta.tier}`;
    if ((usedCopies.get(copyKey) ?? 0) >= (inventory.get(copyKey) ?? 0)) continue;
    selected.add(name);
    usedSlots.set(meta.immortalId, (usedSlots.get(meta.immortalId) ?? 0) + 1);
    usedRuneTypes.add(runeTypeKey);
    usedCopies.set(copyKey, (usedCopies.get(copyKey) ?? 0) + 1);
  }
  return selected;
}

export function optimizeAssignments(state: BuilderState): Recommendation[] {
  const ratings = ratingsFor(state.metaVersion);
  const selected = new Set(state.selectedImmortalIds);
  const favorites = new Set(state.favoriteImmortalIds);
  const inventory = new Map<string, number>();
  const assignments: Assignment[] = [];
  const occupiedSlots = new Map<string, Set<AssignmentSlot>>();
  const lockedRuneTypes = new Set<string>();

  for (const rune of DATA.runes) {
    for (const tier of rune.availableTiers) {
      if (!TIERS.includes(tier)) continue;
      const count = state.inventory[rune.id]?.[tier] ?? 0;
      if (count > 0) inventory.set(`${rune.id}:${tier}`, count);
    }
  }

  for (const lock of reconcileLockedAssignments(state)) {
    const key = `${lock.runeId}:${lock.tier}`;
    const available = inventory.get(key) ?? 0;
    if (available <= 0) continue;
    inventory.set(key, available - 1);
    const slots = occupiedSlots.get(lock.immortalId) ?? new Set<AssignmentSlot>();
    slots.add(lock.slot);
    occupiedSlots.set(lock.immortalId, slots);
    lockedRuneTypes.add(`${lock.immortalId}:${lock.runeId}`);
    const rating = ratings[lock.runeId]?.[lock.immortalId];
    assignments.push({
      ...lock,
      score: rating?.[state.mode] ?? 0,
      confidence: rating?.confidence ?? "provisional",
      locked: true,
    });
  }

  const constraints: SolverModel["constraints"] = {};
  const variables: SolverModel["variables"] = {};
  const binaries: Record<string, 1> = {};
  const metadata = new Map<string, VariableMeta>();

  for (const [immortalIndex, immortal] of DATA.immortals.entries()) {
    if (!selected.has(immortal.id)) continue;
    constraints[`slots:${immortal.id}`] = { max: 2 - (occupiedSlots.get(immortal.id)?.size ?? 0) };
    for (const [runeIndex, rune] of DATA.runes.entries()) {
      if (lockedRuneTypes.has(`${immortal.id}:${rune.id}`)) continue;
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
        const preferenceTieBreaker = tier * (
          immortalPriorityWeight(state.mode, immortal.id, state.immortalPriorityOverrides) * MODE_PRIORITY_TIE_BREAKER
          + (favorites.has(immortal.id) ? FAVORITE_TIE_BREAKER : 0)
        );
        const value = score * RATING_WEIGHT + tier * RUNE_TIER_WEIGHT + preferenceTieBreaker + stableTieBreaker;
        variables[name] = {
          value,
          [copyConstraint]: 1,
          [`slots:${immortal.id}`]: 1,
          [`same:${immortal.id}:${rune.id}`]: 1,
        };
        binaries[name] = 1;
        metadata.set(name, { runeId: rune.id, tier, immortalId: immortal.id, score, confidence: rating.confidence, value });
      }
    }
  }

  for (const immortal of DATA.immortals) {
    if (!selected.has(immortal.id)) continue;
    const pair = bisPairFor(state.metaVersion, immortal.id, state.mode);
    if (!pair) continue;
    const immortalLocks = assignments.filter((assignment) => assignment.immortalId === immortal.id && assignment.locked);
    if (immortalLocks.length >= 2 || immortalLocks.some((assignment) => !pair.runes.includes(assignment.runeId))) continue;
    const [firstRuneId, secondRuneId] = pair.runes;
    const lockedRuneIds = new Set(immortalLocks.map((assignment) => assignment.runeId));
    const requiredRuneIds = [firstRuneId, secondRuneId].filter((runeId) => !lockedRuneIds.has(runeId));
    if (requiredRuneIds.length === 0) continue;
    const pairVariable = `bis:complete:${immortal.id}`;
    variables[pairVariable] = { value: BIS_PAIR_COMPLETION_BONUS };
    for (const runeId of requiredRuneIds) {
      const constraint = `bis:${runeId}:${immortal.id}`;
      constraints[constraint] = { max: 0 };
      variables[pairVariable][constraint] = 1;
      for (const [name, meta] of metadata) {
        if (meta.immortalId === immortal.id && meta.runeId === runeId) variables[name][constraint] = -1;
      }
    }
    binaries[pairVariable] = 1;
  }

  if (Object.keys(variables).length > 0) {
    let selectedNames = new Set<string>();
    try {
      const result = solver.Solve({ optimize: "value", opType: "max", constraints, variables, binaries, timeout: SOLVER_TIMEOUT_MS } as SolverModel & { binaries: Record<string, 1>; timeout: number });
      if (result.feasible) selectedNames = new Set([...metadata.keys()].filter((name) => result[name] === 1));
    } catch {
      // A valid locked setup is still rendered below; remaining slots use the bounded fallback.
    }
    if (selectedNames.size === 0 && metadata.size > 0) selectedNames = greedyFallback(metadata, inventory, occupiedSlots, lockedRuneTypes);
    if (selectedNames.size > 0) {
      const automaticByImmortal = new Map<string, VariableMeta[]>();
      for (const [name, meta] of metadata) {
        if (!selectedNames.has(name)) continue;
        const values = automaticByImmortal.get(meta.immortalId) ?? [];
        values.push(meta);
        automaticByImmortal.set(meta.immortalId, values);
      }
      for (const [immortalId, values] of automaticByImmortal) {
        const taken = occupiedSlots.get(immortalId) ?? new Set<AssignmentSlot>();
        const freeSlots = ([0, 1] as AssignmentSlot[]).filter((slot) => !taken.has(slot));
        values
          .sort((a, b) => b.score - a.score || b.tier - a.tier || a.runeId.localeCompare(b.runeId))
          .forEach((meta, index) => {
            const slot = freeSlots[index];
            if (slot == null) return;
            assignments.push({ ...meta, slot, locked: false });
          });
      }
    }
  }

  return DATA.immortals
    .filter((immortal) => selected.has(immortal.id))
    .map((immortal) => ({
      immortalId: immortal.id,
      assignments: assignments
        .filter((assignment) => assignment.immortalId === immortal.id)
        .sort((a, b) => a.slot - b.slot),
    }))
    .sort((a, b) => b.assignments.length - a.assignments.length || a.immortalId.localeCompare(b.immortalId));
}
