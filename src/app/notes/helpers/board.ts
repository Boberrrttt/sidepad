import type { BoardData } from '@/shared/types';

export function parseBoard(raw: string): BoardData | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed) as BoardData;
    if (parsed?.v !== 1 || !Array.isArray(parsed.columns)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function serializeBoard(board: BoardData) {
  return `${JSON.stringify(board, null, 2)}\n`;
}
