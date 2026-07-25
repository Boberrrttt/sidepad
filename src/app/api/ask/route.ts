import { requireUserId } from '@/server/auth/helpers/session';
import { runAsk } from '@/server/ask/ask.service';
import { errorMessage } from '@/shared/errors';
import type { AskEvent } from '@/shared/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = (await request.json()) as { name?: string; message?: string };

    if (!body.name || !body.message?.trim()) {
      return new Response(JSON.stringify({ type: 'error', message: 'bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const noteName = body.name;
    const message = body.message;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (askEvent: AskEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(askEvent) + '\n'));
        };

        try {
          await runAsk(userId, noteName, message, emit);
        } catch (caughtError) {
          emit({
            type: 'error',
            message: errorMessage(caughtError),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (caughtError) {
    const message = errorMessage(caughtError);
    const status = message === 'unauthorized' ? 401 : 500;

    return new Response(
      JSON.stringify({
        type: 'error',
        message,
      }),
      { status, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
