import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { listChats } from '@/lib/chat';
import { listNotes } from '@/lib/notes';

export async function GET() {
  try {
    const userId = await requireUserId();
    const [notes, chats] = await Promise.all([
      listNotes(userId),
      listChats(userId),
    ]);
    return NextResponse.json({ notes, chats });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
