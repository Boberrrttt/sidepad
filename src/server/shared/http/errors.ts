import { NextResponse } from 'next/server';
import { errorMessage } from '@/shared/errors';

export function jsonError(
  caughtError: unknown,
  statusByMessage: Record<string, number> = {}
) {
  const message = errorMessage(caughtError);
  const status =
    statusByMessage[message] ?? (message === 'unauthorized' ? 401 : 500);

  return NextResponse.json({ error: message }, { status });
}
