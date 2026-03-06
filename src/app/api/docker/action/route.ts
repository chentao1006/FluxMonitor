import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { id, action } = await request.json();

    if (!action || !['start', 'stop', 'restart', 'rm', 'rmi', 'prune'].includes(action)) {
      return NextResponse.json({ error: '无效的操作' }, { status: 400 });
    }

    if (action !== 'prune' && !id) {
      return NextResponse.json({ error: '缺少 ID' }, { status: 400 });
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
      error: 'Docker 操作执行失败',
      details: err?.message || '未知错误'
    }, { status: 500 });
  }
}
