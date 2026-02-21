import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, logPath, command } = body;

    if (action === 'discover_log_path') {
      const possiblePaths = [
        path.join(os.homedir(), '.openclaw', 'openclaw.log'),
        path.join(os.homedir(), '.openclaw', 'logs', 'openclaw.log'),
        path.join(os.homedir(), '.config', 'openclaw', 'openclaw.log'),
        '/usr/local/var/log/openclaw.log',
        '/opt/homebrew/var/log/openclaw.log',
        '/var/log/openclaw.log',
        '/tmp/openclaw.log'
      ];

      let foundPath = '';
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }
      // Return the found path, or fallback to the first typical one so the user at least sees a placeholder
      return NextResponse.json({ success: true, path: foundPath || '~/.openclaw/openclaw.log' });
    }

    if (action === 'logs') {
      let targetPath = logPath || '/tmp/openclaw.log'; // default or user-specified

      if (targetPath.startsWith('~')) {
        targetPath = path.join(os.homedir(), targetPath.slice(1));
      }

      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({ error: `日志文件不存在: ${targetPath}` }, { status: 404 });
      }

      const { stdout } = await execAsync(`tail -n 200 "${targetPath}"`);
      return NextResponse.json({ success: true, data: stdout });
    }

    if (action === 'status') {
      try {
        const { stdout } = await execAsync('openclaw status');
        return NextResponse.json({ success: true, running: true, detail: stdout });
      } catch (e: any) {
        // 'openclaw status' may return non-zero if not running or simply fail if not installed
        return NextResponse.json({ success: true, running: false, detail: e.stdout || e.message });
      }
    }

    if (action === 'command') {
      // Allow execution of openclaw commands
      if (!command || !command.startsWith('openclaw')) {
        return NextResponse.json({ error: '出于安全原因，命令必须以 openclaw 开头' }, { status: 400 });
      }

      const { stdout, stderr } = await execAsync(command);
      return NextResponse.json({ success: true, stdout, stderr });
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: 'OpenClaw 操作失败',
      details: error?.message || '未知错误'
    }, { status: 500 });
  }
}
