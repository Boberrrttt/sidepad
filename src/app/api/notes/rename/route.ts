import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import { renameNote } from '@/server/notes/notes.service';
import { jsonError } from '@/server/shared/http/errors';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      from?: string;
      to?: string;
      mtime?: number;
    };

    if (!body.from || !body.to || typeof body.mtime !== 'number') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    const name = await renameNote(userId, body.from, body.to, body.mtime);
    return NextResponse.json({ name });
  } catch (caughtError) {
    return jsonError(caughtError, { 'note exists': 409 });
  }
}
