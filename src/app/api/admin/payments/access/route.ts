import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, isFinanceAdmin } from '../_lib';

export async function GET(request: NextRequest) {
  try {
    const actor = await getAuthenticatedUser(request);
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized', allowed: false }, { status: 401 });
    }

    if (!isFinanceAdmin(actor.id)) {
      // Access-check endpoint intentionally returns 200 for non-admin users.
      // This avoids noisy browser "Failed to load resource" logs for expected denials.
      return NextResponse.json({ error: 'Forbidden', allowed: false });
    }

    return NextResponse.json({ allowed: true, userId: actor.id });
  } catch (error) {
    console.error('admin-access-check failed:', error);
    return NextResponse.json({ error: 'Internal server error', allowed: false }, { status: 500 });
  }
}
