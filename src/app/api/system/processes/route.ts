import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Get top processes by CPU
    const { stdout } = await execAsync("ps -eo pid,pcpu,pmem,user,comm -r | head -n 20");

    const lines = stdout.trim().split('\n');
    lines.shift(); // Remove header

    const processes = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      const pid = parts.shift();
      const pcpu = parts.shift();
      const pmem = parts.shift();
      const user = parts.shift();
      const comm = parts.join(' ').split('/').pop() || ''; // Extract just the executable name

      return { pid, cpu: pcpu, mem: pmem, user, command: comm };
    });

    return NextResponse.json({ success: true, data: processes });
  } catch (error) {
    return NextResponse.json({ error: '无法获取进程列表' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, pid } = await request.json();

    if (action === 'kill' && pid) {
      if (!/^\d+$/.test(pid)) {
        return NextResponse.json({ error: '无效的进程 ID' }, { status: 400 });
      }

      try {
        await execAsync(`kill -9 ${pid}`);
        return NextResponse.json({ success: true });
      } catch (err: unknown) {
        const error = err as Error;
        const msg = error.message || '';
        if (msg.includes('Operation not permitted') || msg.includes('Permission denied')) {
          return NextResponse.json({ error: '权限不足，无法终止该进程' }, { status: 403 });
        }
        return NextResponse.json({ error: '终止进程失败', details: msg }, { status: 500 });
      }
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: '执行失败', details: error.message }, { status: 500 });
  }
}
