import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    const { stdout } = await execAsync('docker ps -a --format "{{json .}}"', { maxBuffer: 100 * 1024 * 1024 });

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
      return NextResponse.json({ error: 'Docker 未运行或未安装' }, { status: 500 });
    }
    return NextResponse.json({ error: '无法获取 Docker 容器列表', details: err?.message }, { status: 500 });
  }
}
