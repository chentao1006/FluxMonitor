import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'MISSING_CONTAINER_ID' }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(`docker logs --tail 100 ${id}`, { maxBuffer: 100 * 1024 * 1024 });
    return NextResponse.json({
      success: true,
      logs: stdout || stderr
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'FETCH_LOGS_FAILED',
      details: error?.message || 'UNKNOWN_ERROR',
      logs: error?.stderr || ''
    }, { status: 500 });
  }
}
