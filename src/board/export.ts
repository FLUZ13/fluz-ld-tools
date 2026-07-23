import { BOARD_GUARDIAN_BY_ID, getBoardMap, type BoardState } from "./model";

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${source}`));
  image.src = source;
});

function drawCover(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  context.drawImage(image, (image.width - sourceWidth) / 2, (image.height - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}

export async function renderBoardPng(board: BoardState) {
  const width = 1200;
  const map = getBoardMap(board.map);
  const cell = 103;
  const gap = 10;
  const boardHeight = 70 + map.rows * (cell + gap);
  const height = 112 + board.players * boardHeight + (board.players - 1) * 18 + 42;
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
    const x = 35;
    const y = 112 + player * (boardHeight + 18);
    const sectionWidth = width - 70;
    drawCover(context, mapImage, x, y, sectionWidth, boardHeight);
    context.fillStyle = "rgba(44, 31, 23, .35)";
    context.fillRect(x, y, sectionWidth, boardHeight);
    context.strokeStyle = "#d9ae58";
    context.lineWidth = 5;
    context.strokeRect(x, y, sectionWidth, boardHeight);
    context.fillStyle = "rgba(53, 43, 34, .82)";
    context.fillRect(x + 12, y + 12, 120, 36);
    context.fillStyle = "#fff1d1";
    context.font = "700 18px Arial";
    context.fillText(`PLAYER ${player + 1}`, x + 27, y + 37);

    const gridWidth = map.columns * cell + (map.columns - 1) * gap;
    const gridX = x + (sectionWidth - gridWidth) / 2;
    const gridY = y + 54;
    for (let slot = 0; slot < map.columns * map.rows; slot += 1) {
      const column = slot % map.columns;
      const row = Math.floor(slot / map.columns);
      const cellX = gridX + column * (cell + gap);
      const cellY = gridY + row * (cell + gap);
      context.fillStyle = "rgba(241, 223, 189, .82)";
      context.fillRect(cellX, cellY, cell, cell);
      context.strokeStyle = "rgba(53, 43, 34, .78)";
      context.lineWidth = 3;
      context.strokeRect(cellX, cellY, cell, cell);
      const id = board.slots[player][slot];
      const icon = id ? iconCache.get(id) : undefined;
      if (icon) context.drawImage(icon, cellX + 7, cellY + 7, cell - 14, cell - 14);
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
