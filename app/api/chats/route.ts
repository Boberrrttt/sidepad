import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';
import { deleteChat, writeChat } from '@/lib/chat';

export async function PUT(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as {
      name?: string;
      messages?: unknown;
      mtime?: number;
    };
    if (!body.name || typeof body.mtime !== 'number') {
      return NextResponse.json({ error: 'bad request' }, { status: 400 });
    }
    const chat = await writeChat(
      userId,
      body.name,
      Array.isArray(body.messages) ? body.messages : [],
      body.mtime
    );
    return NextResponse.json(chat);
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
    const mtime = Number(url.searchParams.get('mtime') || Date.now());
    if (!name) return NextResponse.json({ error: 'bad request' }, { status: 400 });
    await deleteChat(userId, name, mtime);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const status = msg === 'unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
