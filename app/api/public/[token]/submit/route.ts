import { NextRequest, NextResponse } from 'next/server';
import { submitByToken } from '@/lib/assignments/status';

export async function POST(
  _request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    await submitByToken(params.token);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Submit failed';
    const status = message.includes('Cannot submit') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
