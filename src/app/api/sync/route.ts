import { NextResponse } from 'next/server';
import { requireUserId } from '@/server/auth/helpers/session';
import { pullSync } from '@/server/sync/sync.service';
import { jsonError } from '@/server/shared/http/errors';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json(await pullSync(userId));
  } catch (caughtError) {
    return jsonError(caughtError);
  }
}
