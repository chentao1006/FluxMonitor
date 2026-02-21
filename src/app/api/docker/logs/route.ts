import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: '缺少容器 ID' }, { status: 400 });
  }

  try {
    const { stdout, stderr } = await execAsync(`docker logs --tail 100 ${id}`);
    return NextResponse.json({
      success: true,
      logs: stdout || stderr
    });
  } catch (error: any) {
    return NextResponse.json({
      error: '获取日志失败',
      details: error?.message || '未知错误',
      logs: error?.stderr || ''
    }, { status: 500 });
  }
}
