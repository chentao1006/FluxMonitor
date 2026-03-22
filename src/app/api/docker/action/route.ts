import { NextResponse } from 'next/server';
import { execAsync } from '@/lib/exec';

export async function POST(request: Request) {
  try {
    const { id, action } = await request.json();

    if (!action || !['start', 'stop', 'restart', 'rm', 'rmi', 'prune'].includes(action)) {
      return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
    }

    if (action !== 'prune' && !id) {
      return NextResponse.json({ error: 'MISSING_ID' }, { status: 400 });
    }

    let cmd = `docker ${action} ${id || ''}`;
    if (action === 'prune') {
      cmd = `docker image prune -f`;
    }

    const { stdout, stderr } = await execAsync(cmd);

    return NextResponse.json({
      success: true,
      stdout: stdout,
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({
      error: 'DOCKER_ACTION_FAILED',
      details: err?.message || 'UNKNOWN_ERROR'
    }, { status: 500 });
  }
}
