import type { Note } from '@/shared/types';
import { safeName } from '@/server/notes/helpers/safe-name';
import * as notesRepo from '@/server/notes/notes.repository';

export async function listNotes(userId: string): Promise<Note[]> {
  return notesRepo.listNotes(userId);
}

export async function readNote(userId: string, name: string): Promise<Note | null> {
  return notesRepo.readNote(userId, safeName(name));
}

export async function writeNote(
  userId: string,
  name: string,
  body: string,
  mtime: number,
  board?: string
): Promise<Note> {
  const noteName = safeName(name);
  const existing = await notesRepo.readNote(userId, noteName);

  if (existing && existing.mtime > mtime) return existing;

  const nextBoard =
    board !== undefined ? String(board) : String(existing?.board ?? '');

  await notesRepo.upsertNote(
    userId,
    noteName,
    String(body ?? ''),
    nextBoard,
    mtime
  );
  return (await notesRepo.readNote(userId, noteName))!;
}

export async function renameNote(
  userId: string,
  from: string,
  to: string,
  mtime: number
): Promise<string> {
  const sourceName = safeName(from);
  const destName = safeName(to);

  if (sourceName === destName) return destName;

  const destRow = await notesRepo.readNote(userId, destName);
  if (destRow) throw new Error('note exists');

  const sourceRow = await notesRepo.readNote(userId, sourceName);
  if (!sourceRow) throw new Error('note missing');

  const nextMtime = Math.max(mtime, sourceRow.mtime);
  await notesRepo.renameNoteAndChat(userId, sourceName, destName, nextMtime);
  return destName;
}

export async function deleteNote(
  userId: string,
  name: string,
  mtime: number
): Promise<void> {
  await notesRepo.deleteNoteAndChat(userId, safeName(name), mtime);
}
