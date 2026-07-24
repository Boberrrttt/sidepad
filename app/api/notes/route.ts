import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { deleteNote, listNotes, writeNote } from '@/lib/notes';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await listNotes(userId));
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as {
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
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(req.url);
    const name = url.searchParams.get('name');
    const mtime = Number(url.searchParams.get('mtime') || 0);
    if (!name) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    await deleteNote(userId, name, mtime);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
