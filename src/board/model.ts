import { DATA } from "../model";

export type BoardMapId = "normal" | "hard-red" | "hell" | "god" | "primeval" | "invasion" | "guild" | "extreme";
export type BoardPlayerCount = 1 | 2;
export type GuardianRarity = "common" | "rare" | "epic" | "legendary" | "mythic" | "immortal";

export interface BoardGuardian {
  id: string;
  name: string;
  rarity: GuardianRarity;
  image: string;
}

export interface BoardState {
  schemaVersion: 1;
  id: string;
  title: string;
  map: BoardMapId;
  players: BoardPlayerCount;
  slots: [Array<string | null>, Array<string | null>];
  updatedAt: string;
}

export interface PublishedBoard {
  boardId: string;
  title: string;
  map: BoardMapId;
  players: BoardPlayerCount;
  slots: BoardState["slots"];
  updatedAt: string;
}

export interface BoardMap {
  id: BoardMapId;
  name: string;
  image: string;
  columns: number;
  rows: number;
}

export const BOARD_MAPS: BoardMap[] = [
  { id: "normal", name: "Normal", image: "/assets/board/maps/normal.png", columns: 6, rows: 3 },
  { id: "hard-red", name: "Hard", image: "/assets/board/maps/hard.png", columns: 6, rows: 3 },
  { id: "hell", name: "Hell", image: "/assets/board/maps/hell.png", columns: 6, rows: 3 },
  { id: "god", name: "God", image: "/assets/board/maps/god.png", columns: 6, rows: 3 },
  { id: "primeval", name: "Primeval", image: "/assets/board/maps/primeval.png", columns: 6, rows: 3 },
  { id: "invasion", name: "Invasion", image: "/assets/board/maps/invasion.png", columns: 6, rows: 3 },
  { id: "guild", name: "Guild Battle", image: "/assets/board/maps/guild.png", columns: 6, rows: 4 },
  { id: "extreme", name: "Extreme", image: "/assets/board/maps/extreme.png", columns: 6, rows: 5 },
];

const baseGuardians: Array<[string, string, GuardianRarity, string?]> = [
  ["1001", "Archer", "common"], ["1002", "Bandit", "common", "1005"], ["1003", "Thrower", "common", "1002"],
  ["1004", "Water Element", "common"], ["1005", "Barbarian", "common", "1003"],
  ["2001", "Ranger", "rare"], ["2002", "Shock Robot", "rare"], ["2003", "Paladin", "rare"],
  ["2004", "Sandman", "rare"], ["2005", "Demon Soldier", "rare"],
  ["3001", "Electro Robot", "epic"], ["3002", "Tree", "epic"], ["3003", "Hunter", "epic"],
  ["3005", "Eagle General", "epic"], ["3006", "Wolf Warrior", "epic"],
  ["4003", "War Machine", "legendary"], ["4004", "Tiger Master", "legendary"],
  ["4005", "Storm Giant", "legendary"], ["4007", "Sheriff", "legendary"],
  ["3004", "Graviton", "mythic"], ["3007", "Ninja", "mythic"], ["4001", "Orc Shaman", "mythic"],
  ["4002", "Pulse Generator", "mythic"], ["4006", "Kitty Mage", "mythic"], ["5001", "Bomba", "mythic"],
  ["5002", "Coldy", "mythic"], ["5003", "Lancelot", "mythic"], ["5004", "Dragon", "mythic", "5006"],
  ["5005", "Blob", "mythic"], ["5006", "Iron Meow", "mythic", "5004"], ["5007", "Monopoly Man", "mythic"],
  ["5008", "Mama", "mythic"], ["5009", "Frog Prince", "mythic"], ["5010", "Batman", "mythic"],
  ["5011", "Vayne", "mythic"], ["5012", "Indy", "mythic"], ["5013", "Watt", "mythic"],
  ["5014", "Tar", "mythic"], ["5015", "Rocket Chu", "mythic"], ["5016", "Lazy Taoist", "mythic"],
  ["5017", "Zap", "mythic"], ["5018", "Master Kun", "mythic"], ["5019", "Verdee", "mythic"],
  ["5020", "Penguin Musician", "mythic"], ["5021", "Hailey", "mythic"], ["5022", "Ato", "mythic"],
  ["5023", "Roka", "mythic"], ["5024", "Birdraw", "mythic"], ["5025", "Giga Chad", "mythic"],
  ["5026", "Savior Ray", "mythic"],
];

export const BOARD_GUARDIANS: BoardGuardian[] = [
  ...baseGuardians.map(([id, name, rarity, imageId = id]) => ({
    id,
    name,
    rarity,
    image: `/assets/board/guardians/${imageId}.png`,
  })),
  ...DATA.immortals.map((guardian) => ({
    id: guardian.assetId,
    name: guardian.name,
    rarity: "immortal" as const,
    image: guardian.boardImage,
  })),
];

export const BOARD_GUARDIAN_BY_ID = new Map(BOARD_GUARDIANS.map((guardian) => [guardian.id, guardian]));

export function slotsForMap(map: BoardMapId) {
  const activeMap = getBoardMap(map);
  return activeMap.columns * activeMap.rows;
}

export function resizeBoardSlots(slots: BoardState["slots"], map: BoardMapId): BoardState["slots"] {
  const count = slotsForMap(map);
  return [0, 1].map((player) => Array.from({ length: count }, (_, index) => slots[player]?.[index] ?? null)) as BoardState["slots"];
}

export function createBoardState(): BoardState {
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: "My Lucky Defense board",
    map: "normal",
    players: 1,
    slots: [Array(slotsForMap("normal")).fill(null), Array(slotsForMap("normal")).fill(null)],
    updatedAt: new Date().toISOString(),
  };
}

/** Keeps boards made before the Normal/Hard split on their original green map. */
export function normalizeBoardMapId(value: unknown): BoardMapId {
  if (value === "hard") return "normal";
  return BOARD_MAPS.some((map) => map.id === value) ? value as BoardMapId : "normal";
}

export function getBoardMap(value: unknown) {
  const mapId = normalizeBoardMapId(value);
  return BOARD_MAPS.find((map) => map.id === mapId) ?? BOARD_MAPS[0];
}

export function migrateBoardState(value: unknown): BoardState | null {
  if (!value || typeof value !== "object") return null;
  const board = value as Partial<BoardState> & { map?: unknown };
  const map = normalizeBoardMapId(board.map);
  const slotsAreValid = Array.isArray(board.slots) && board.slots.length === 2 && board.slots.every((slots) =>
    Array.isArray(slots) && slots.every((id) => id === null || (typeof id === "string" && BOARD_GUARDIAN_BY_ID.has(id))),
  );
  const normalized = { ...board, map, slots: slotsAreValid ? resizeBoardSlots(board.slots as BoardState["slots"], map) : board.slots };
  return isBoardState(normalized) ? normalized : null;
}

export function isBoardState(value: unknown): value is BoardState {
  if (!value || typeof value !== "object") return false;
  const board = value as Partial<BoardState>;
  const maps = new Set(BOARD_MAPS.map((map) => map.id));
  const validSlots = Array.isArray(board.slots) && board.slots.length === 2 && board.slots.every((slots) =>
    Array.isArray(slots) && slots.length === slotsForMap(board.map as BoardMapId) && slots.every((id) => id === null || (typeof id === "string" && BOARD_GUARDIAN_BY_ID.has(id))),
  );
  return board.schemaVersion === 1 && typeof board.id === "string" && typeof board.title === "string" &&
    board.title.length <= 80 && maps.has(board.map as BoardMapId) && (board.players === 1 || board.players === 2) && validSlots;
}

export function boardToPublished(board: BoardState, boardId = board.id): PublishedBoard {
  return { boardId, title: board.title, map: normalizeBoardMapId(board.map), players: board.players, slots: board.slots, updatedAt: board.updatedAt };
}
