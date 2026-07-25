import { listChats } from '@/server/chat/chat.service';
import { listNotes } from '@/server/notes/notes.service';

export async function pullSync(userId: string) {
  const [notes, chats] = await Promise.all([
    listNotes(userId),
    listChats(userId),
  ]);

  return { notes, chats };
}
