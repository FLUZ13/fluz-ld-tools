import { describe, expect, it } from "vitest";
import { decodeSharedBoard, encodeSharedBoard } from "./export";
import { BOARD_GUARDIANS, BOARD_MAPS, createBoardState, isBoardState, migrateBoardState } from "./model";

describe("board model", () => {
  it("contains every requested map and guardian rarity", () => {
    expect(BOARD_MAPS).toHaveLength(8);
    expect(BOARD_GUARDIANS).toHaveLength(77);
    expect(new Set(BOARD_GUARDIANS.map((guardian) => guardian.rarity))).toEqual(
      new Set(["common", "rare", "epic", "legendary", "mythic", "immortal"]),
    );
  });

  it("validates only compact 18-slot boards", () => {
    const board = createBoardState();
    expect(isBoardState(board)).toBe(true);
    board.slots[0].push(null);
    expect(isBoardState(board)).toBe(false);
  });

  it("keeps pre-Normal board saves on their original map", () => {
    const legacy = { ...createBoardState(), map: "hard" };
    expect(migrateBoardState(legacy)?.map).toBe("normal");
  });

  it("round-trips share links without losing Unicode titles", () => {
    const board = createBoardState();
    board.title = "Hailey + Tar strategy";
    board.slots[0][0] = "15021";
    expect(decodeSharedBoard(encodeSharedBoard(board))).toEqual(board);
  });
});
