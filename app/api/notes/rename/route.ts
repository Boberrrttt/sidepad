import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { renameNote } from '@/lib/notes';

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as {
      from?: string;
      to?: string;
      mtime?: number;
    };
    if (!body.from || !body.to || typeof body.mtime !== 'number') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }
    const name = await renameNote(userId, body.from, body.to, body.mtime);
    return NextResponse.json({ name });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status =
      msg === 'note exists' ? 409 : msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
