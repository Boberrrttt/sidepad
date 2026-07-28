import type { BoardData } from '@/shared/types';

export function parseBoard(raw: string): BoardData | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed) as BoardData & {
      github?: BoardData['github'] & { token?: unknown };
    };

    if (parsed?.v !== 1 || !Array.isArray(parsed.columns)) return null;

    if (parsed.github && 'token' in parsed.github) {
      const { token: _ignored, ...github } = parsed.github;
      return { ...parsed, github };
    }

    return parsed;
  } catch {
    return null;
  }
}

export function serializeBoard(board: BoardData) {
  return `${JSON.stringify(board, null, 2)}\n`;
}
