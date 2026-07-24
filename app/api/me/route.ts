import { NextResponse } from 'next/server';
import { requireUserId } from '@/lib/auth';

export async function GET() {
  try {
    const userId = await requireUserId();
    return NextResponse.json({ userId });
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
}
