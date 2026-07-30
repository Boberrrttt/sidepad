import { parseBoard, serializeBoard } from '@/app/notes/helpers/board';
import { disconnectGithubProject } from '@/app/notes/github/api';
import { listNotesLocal, writeNoteLocal } from '@/app/notes/sync/api';
import type { BoardData, Note } from '@/app/shared/types';

export async function unlinkGithubBoard(
  board: BoardData | null,
  keepColumns: boolean
) {
  if (board?.github?.projectId) {
    await disconnectGithubProject(board.github.projectId).catch(() => {});
  }

  return serializeBoard({
    v: 1,
    columns: keepColumns ? (board?.columns ?? []) : [],
  });
}

export async function findLinkedNote(
  noteName: string,
  org: string,
  projectNumber: number
) {
  const notes = await listNotesLocal();
  const orgKey = org.toLowerCase();

  return (
    notes.find((note) => {
      if (note.name === noteName) return false;

      const board = parseBoard(note.board);
      if (!board?.github) return false;

      return (
        board.github.org.toLowerCase() === orgKey &&
        board.github.projectNumber === projectNumber
      );
    }) ?? null
  );
}

export async function disconnectLinkedNote(note: Note) {
  const board = parseBoard(note.board);
  if (!board) return;

  await writeNoteLocal(
    note.name,
    note.body,
    await unlinkGithubBoard(board, true)
  );
}
