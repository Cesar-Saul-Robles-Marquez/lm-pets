import type { BedColor } from "@/lib/types";

// IMPORTANT: file name contains a space, so encode it for URLs.
export const BED_SPRITESHEET_URL = "/Recursos/Sprites/beds%20sprites.png";

export const BED_GRID_COLS = 3;
export const BED_GRID_ROWS = 4;
export const BED_COLOR_COUNT = BED_GRID_COLS * BED_GRID_ROWS;

// The shop only sells the blue bed. In the sprite sheet, blue is top row, middle.
export const BED_SHOP_DEFAULT_COLOR: BedColor = 1;

export function bedColorToCell(color: BedColor): { col: number; row: number } {
  const idx = Number(color);
  const col = idx % BED_GRID_COLS;
  const row = Math.floor(idx / BED_GRID_COLS);
  return { col, row };
}

export function bedBackgroundPosition(col: number, row: number): { x: string; y: string } {
  // For N columns, use background-size N*100% and position using col/(N-1) mapping.
  const x = (BED_GRID_COLS as number) === 1 ? "0%" : `${(col / (BED_GRID_COLS - 1)) * 100}%`;
  const y = (BED_GRID_ROWS as number) === 1 ? "0%" : `${(row / (BED_GRID_ROWS - 1)) * 100}%`;
  return { x, y };
}
