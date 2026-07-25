import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import { deleteNote, listNotes, writeNote } from '@/server/notes/notes.service';
import { jsonError } from '@/server/shared/http/errors';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await listNotes(userId));
  } catch (caughtError) {
    return jsonError(caughtError);
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
      name?: string;
      body?: string;
      mtime?: number;
    };

    if (!body.name || typeof body.mtime !== 'number') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }

    const note = await writeNote(
      userId,
      body.name,
      String(body.body ?? ''),
      body.mtime
    );

    return NextResponse.json(note);
  } catch (caughtError) {
    return jsonError(caughtError);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    const mtime = Number(url.searchParams.get('mtime') || 0);

    if (!name) return NextResponse.json({ error: 'bad request' }, { status: 400 });

    await deleteNote(userId, name, mtime);
    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    return jsonError(caughtError);
  }
}
