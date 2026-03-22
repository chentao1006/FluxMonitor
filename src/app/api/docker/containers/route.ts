import { NextResponse } from 'next/server';
import { execAsync } from '@/lib/exec';

export async function GET() {
  try {
    const { stdout } = await execAsync('docker ps -a --format "{{json .}}"', {
      maxBuffer: 100 * 1024 * 1024,
    });

    // stdout contains one JSON object per line.
    const lines = stdout.trim().split('\n').filter(Boolean);
    const containers = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return NextResponse.json({ success: true, data: containers });
  } catch (error: unknown) {
    const err = error as Error;
    if (err?.message?.includes('command not found')) {
      return NextResponse.json({ error: 'DOCKER_NOT_RUNNING' }, { status: 500 });
    }
    return NextResponse.json({ error: 'FETCH_FAILED', details: err?.message }, { status: 500 });
  }
}
