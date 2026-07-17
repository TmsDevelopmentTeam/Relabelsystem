// Tablero: columnas letras (A-E), filas números (1-10). 5×10 = 50 casillas por defecto.
// Nomenclatura tipo Excel: "A1", "B3", "E10".
// LLENADO VERTICAL: se llena primero la columna A (A1..A10), luego B (B1..B10), etc.

export const BOARD_COLS = Number(process.env.BOARD_COLS ?? 5);
export const BOARD_ROWS = Number(process.env.BOARD_ROWS ?? 10);
export const TOTAL_CELLS = BOARD_COLS * BOARD_ROWS;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function columnLetter(colIdx: number): string {
  // colIdx: 0-based
  return LETTERS[colIdx] ?? `?${colIdx}`;
}

export function cellName(colIdx: number, rowIdx: number): string {
  // Ambos 0-based; nombre humano: letra + (row+1)
  return `${columnLetter(colIdx)}${rowIdx + 1}`;
}

// Genera todas las celdas en orden de LLENADO VERTICAL:
// A1, A2, A3... A10, B1, B2... B10, C1... E10
export function allCellsVertical(): string[] {
  const out: string[] = [];
  for (let c = 0; c < BOARD_COLS; c++) {
    for (let r = 0; r < BOARD_ROWS; r++) out.push(cellName(c, r));
  }
  return out;
}

// Para render visual: matriz por filas [[A1,B1,C1,D1,E1], [A2,B2,...], ...]
export function boardMatrix(): string[][] {
  const m: string[][] = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    const row: string[] = [];
    for (let c = 0; c < BOARD_COLS; c++) row.push(cellName(c, r));
    m.push(row);
  }
  return m;
}

export function parseCell(s: string): { col: number; row: number } | null {
  const m = s.match(/^([A-Z])(\d+)$/i);
  if (!m) return null;
  const col = LETTERS.indexOf(m[1].toUpperCase());
  const row = Number(m[2]) - 1;
  if (col < 0 || row < 0) return null;
  return { col, row };
}
