import { BOARD_GUARDIAN_BY_ID, getBoardMap, type BoardState } from "./model";

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${source}`));
  image.src = source;
});

export async function renderBoardPng(board: BoardState) {
  const width = 1200;
  const map = getBoardMap(board.map);
  const mapWidth = width - 90;
  const mapHeight = Math.round(mapWidth / map.aspectRatio);
  const boardGap = 26;
  const height = 112 + board.players * mapHeight + (board.players - 1) * boardGap + 44;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable in this browser.");
  const mapImage = await loadImage(map.image);

  context.fillStyle = "#352b22";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#f1dfbd";
  context.font = "700 38px Arial";
  context.fillText(board.title || "Lucky Defense board", 42, 55);
  context.fillStyle = "#d5b477";
  context.font = "700 19px Arial";
  context.fillText(`${map.name} - ${board.players} player`, 44, 88);

  const iconCache = new Map<string, HTMLImageElement>();
  const ids = [...new Set(board.slots.flat().filter((id): id is string => Boolean(id)))];
  await Promise.all(ids.map(async (id) => {
    const guardian = BOARD_GUARDIAN_BY_ID.get(id);
    if (guardian) iconCache.set(id, await loadImage(guardian.image));
  }));

  for (let player = 0; player < board.players; player += 1) {
    const x = (width - mapWidth) / 2;
    const y = 112 + player * (mapHeight + boardGap);
    context.save();
    context.shadowColor = "rgba(18, 12, 8, .45)";
    context.shadowBlur = 16;
    context.shadowOffsetY = 10;
    context.drawImage(mapImage, x, y, mapWidth, mapHeight);
    context.restore();

    const gridX = x + mapWidth * map.gridInset.left / 100;
    const gridY = y + mapHeight * map.gridInset.top / 100;
    const gridWidth = mapWidth * (100 - map.gridInset.left - map.gridInset.right) / 100;
    const gridHeight = mapHeight * (100 - map.gridInset.top - map.gridInset.bottom) / 100;
    const cellWidth = gridWidth / map.columns;
    const cellHeight = gridHeight / map.rows;

    context.fillStyle = "rgba(53, 43, 34, .82)";
    context.fillRect(gridX, Math.max(y + 4, gridY - 30), 120, 30);
    context.fillStyle = "#fff1d1";
    context.font = "700 16px Arial";
    context.fillText(`PLAYER ${player + 1}`, gridX + 12, Math.max(y + 24, gridY - 9));

    for (let slot = 0; slot < map.columns * map.rows; slot += 1) {
      const column = slot % map.columns;
      const row = Math.floor(slot / map.columns);
      const cellX = gridX + column * cellWidth;
      const cellY = gridY + row * cellHeight;
      context.strokeStyle = "rgba(53, 43, 34, .5)";
      context.lineWidth = 2;
      context.setLineDash([7, 6]);
      context.strokeRect(cellX, cellY, cellWidth, cellHeight);
      context.setLineDash([]);
      const id = board.slots[player][slot];
      const icon = id ? iconCache.get(id) : undefined;
      if (icon) {
        const iconSize = Math.min(cellWidth, cellHeight) * .86;
        context.drawImage(icon, cellX + (cellWidth - iconSize) / 2, cellY + (cellHeight - iconSize) / 2, iconSize, iconSize);
      }
    }
  }

  context.fillStyle = "#cbb18a";
  context.font = "16px Arial";
  context.fillText("Created with ld.fluz-tools.com/board-builder", 42, height - 23);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), "image/png"));
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function encodeSharedBoard(board: BoardState) {
  const bytes = new TextEncoder().encode(JSON.stringify(board));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeSharedBoard(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
