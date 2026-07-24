import { requireUserId } from '@/lib/auth';
import { runAsk } from '@/lib/ai';
import type { AskEvent } from '@/lib/types';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as { name?: string; message?: string };
    if (!body.name || !body.message?.trim()) {
      return new Response(JSON.stringify({ type: 'error', message: 'bad request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (ev: AskEvent) => {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
        };

        try {
          await runAsk(userId, body.name!, body.message!, emit);
        } catch (err) {
          emit({
            type: 'error',
            message: String(err instanceof Error ? err.message : err),
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
  } catch (err) {
    return new Response(
      JSON.stringify({
        type: 'error',
        message: String(err instanceof Error ? err.message : err),
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
