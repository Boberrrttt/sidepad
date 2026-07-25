import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import { deleteChat, writeChat } from '@/server/chat/chat.service';
import { jsonError } from '@/server/shared/http/errors';

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as {
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
  } catch (caughtError) {
    return jsonError(caughtError);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const name = url.searchParams.get('name');
    const mtime = Number(url.searchParams.get('mtime') || Date.now());

    if (!name) return NextResponse.json({ error: 'bad request' }, { status: 400 });

    await deleteChat(userId, name, mtime);
    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    return jsonError(caughtError);
  }
}
