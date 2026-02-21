import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { id, action } = await request.json();

    if (!id || !['start', 'stop', 'restart', 'rm', 'rmi'].includes(action)) {
      return NextResponse.json({ error: '无效的操作或 ID' }, { status: 400 });
    }

    const { stdout, stderr } = await execAsync(`docker ${action} ${id}`);

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
