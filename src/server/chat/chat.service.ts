import type { Chat, ChatMessage } from '@/shared/types';
import * as chatsRepo from '@/server/chat/chats.repository';
import { safeName } from '@/server/notes/helpers/safe-name';

export async function readChat(userId: string, name: string): Promise<Chat> {
  return chatsRepo.readChat(userId, safeName(name));
}

export async function writeChat(
  userId: string,
  name: string,
  messages: ChatMessage[],
  mtime: number
): Promise<Chat> {
  const noteName = safeName(name);
  const existing = await chatsRepo.readChat(userId, noteName);

  if (existing.mtime > mtime) return existing;

  await chatsRepo.upsertChat(userId, noteName, messages, mtime);
  return chatsRepo.readChat(userId, noteName);
}

export async function deleteChat(
  userId: string,
  name: string,
  mtime: number
): Promise<void> {
  await chatsRepo.deleteChat(userId, safeName(name), mtime);
}

export async function listChats(userId: string): Promise<Chat[]> {
  return chatsRepo.listChats(userId);
}
