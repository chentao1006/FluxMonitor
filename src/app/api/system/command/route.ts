import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { command } = await request.json();

    // Security note: In a real production environment executing arbitrary 
    // commands from an API is extremely dangerous without strict sanitization.
    // Given the constraints of a personal monitor, we allow it but note the risk.
    if (!command) {
      return NextResponse.json({ error: '命令不能为空' }, { status: 400 });
    }

    const COMMON_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin';
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 100 * 1024 * 1024,
      env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
    });

    return NextResponse.json({
      success: true,
      stdout: stdout,
      stderr: stderr
    });
  } catch (error: any) {
    return NextResponse.json({
      error: '命令执行失败',
      details: error?.message || '未知错误'
    }, { status: 500 });
  }
}
