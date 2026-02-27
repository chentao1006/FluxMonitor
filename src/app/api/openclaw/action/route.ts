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
    const { action, logPath, command, path: targetPath, content } = body;

    const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
    const WORKSPACE_DIR = path.join(OPENCLAW_DIR, 'workspace');
    const CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');
    const MEMORY_DIR = path.join(WORKSPACE_DIR, 'memory');

    if (action === 'discover_log_path') {
      const possiblePaths = [
        path.join(OPENCLAW_DIR, 'logs', 'gateway.log'),
        path.join(OPENCLAW_DIR, 'logs', 'gateway.err.log'),
        path.join(OPENCLAW_DIR, 'openclaw.log'),
        path.join(OPENCLAW_DIR, 'logs', 'openclaw.log'),
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
      return NextResponse.json({ success: true, path: foundPath || '~/.openclaw/openclaw.log' });
    }

    if (action === 'get_config') {
      if (!fs.existsSync(CONFIG_PATH)) {
        return NextResponse.json({ success: true, content: '{}', message: '配置文件不存在，已返回空配置' });
      }
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return NextResponse.json({ success: true, content: data });
    }

    if (action === 'save_config') {
      if (!fs.existsSync(OPENCLAW_DIR)) {
        fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
      }
      fs.writeFileSync(CONFIG_PATH, content, 'utf-8');
      return NextResponse.json({ success: true });
    }

    if (action === 'list_memory') {
      if (!fs.existsSync(MEMORY_DIR)) {
        return NextResponse.json({ success: true, files: [] });
      }
      const files = fs.readdirSync(MEMORY_DIR)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const fullPath = path.join(MEMORY_DIR, f);
          const stats = fs.statSync(fullPath);
          return {
            name: f,
            path: fullPath,
            size: stats.size,
            mtime: stats.mtime
          };
        });

      // Also check for root level memory files in workspace
      const rootFiles = ['MEMORY.md', 'SOUL.md', 'USER.md', 'README.md', 'AGENTS.md', 'TOOLS.md', 'IDENTITY.md'];
      for (const f of rootFiles) {
        const fullPath = path.join(WORKSPACE_DIR, f);
        if (fs.existsSync(fullPath)) {
          const stats = fs.statSync(fullPath);
          files.push({
            name: f,
            path: fullPath,
            size: stats.size,
            mtime: stats.mtime
          });
        }
      }

      return NextResponse.json({ success: true, files });
    }

    if (action === 'read_memory') {
      if (!targetPath || !fs.existsSync(targetPath)) {
        return NextResponse.json({ error: '文件不存在' }, { status: 404 });
      }
      // Security check: ensure path is within .openclaw
      if (!targetPath.includes('.openclaw')) {
        return NextResponse.json({ error: '非法路径' }, { status: 403 });
      }
      const data = fs.readFileSync(targetPath, 'utf-8');
      return NextResponse.json({ success: true, content: data });
    }

    if (action === 'save_memory') {
      if (!targetPath) return NextResponse.json({ error: '未指定路径' }, { status: 400 });
      if (!targetPath.includes('.openclaw')) {
        return NextResponse.json({ error: '非法路径' }, { status: 403 });
      }
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content, 'utf-8');
      return NextResponse.json({ success: true });
    }

    if (action === 'logs') {
      let targetPath = logPath;

      if (!targetPath) {
        // Try to discover automatically
        const possiblePaths = [
          path.join(OPENCLAW_DIR, 'logs', 'gateway.log'),
          path.join(OPENCLAW_DIR, 'logs', 'gateway.err.log'),
          path.join(OPENCLAW_DIR, 'openclaw.log'),
          path.join(OPENCLAW_DIR, 'logs', 'openclaw.log'),
          '/tmp/openclaw.log'
        ];
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            targetPath = p;
            break;
          }
        }
      }

      if (!targetPath) {
        targetPath = '/tmp/openclaw.log';
      }

      if (targetPath.startsWith('~')) {
        targetPath = path.join(os.homedir(), targetPath.slice(1));
      }

      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({
          success: false,
          error: `日志文件不存在: ${targetPath}`,
          searched: [path.join(OPENCLAW_DIR, 'logs', 'gateway.log'), path.join(OPENCLAW_DIR, 'logs', 'gateway.err.log')]
        }, { status: 404 });
      }

      try {
        // Use fs for direct reading instead of exec to avoid hanging shell processes
        const stats = fs.statSync(targetPath);
        const size = stats.size;
        const readSize = Math.min(size, 50000); // Read last 50KB roughly

        const buffer = Buffer.alloc(readSize);
        const fd = fs.openSync(targetPath, 'r');
        fs.readSync(fd, buffer, 0, readSize, Math.max(0, size - readSize));
        fs.closeSync(fd);

        const content = buffer.toString('utf-8');
        // Simple "tail" by splitting lines
        const lines = content.split('\n').slice(-200).join('\n');

        return NextResponse.json({
          success: true,
          data: lines,
          path: targetPath,
          size: size,
          time: new Date().toISOString()
        });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: `无法读取日志: ${e.message}` }, { status: 500 });
      }
    }

    if (action === 'status') {
      try {
        const { stdout } = await execAsync('openclaw status', { timeout: 5000 });
        return NextResponse.json({ success: true, running: true, detail: stdout });
      } catch (e: any) {
        return NextResponse.json({ success: true, running: false, detail: e.stdout || e.message });
      }
    }

    if (action === 'command') {
      if (!command || !command.startsWith('openclaw')) {
        return NextResponse.json({ error: '出于安全原因，命令必须以 openclaw 开头' }, { status: 400 });
      }

      if (command.includes('--follow') || command.includes('-f ')) {
        return NextResponse.json({ error: '出于安全原因，不支持 --follow 等交互式命令。请在终端直接运行。' }, { status: 400 });
      }

      try {
        const { stdout, stderr } = await execAsync(command, { timeout: 15000 });
        return NextResponse.json({ success: true, stdout, stderr });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message, stdout: e.stdout, stderr: e.stderr });
      }
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: 'OpenClaw 操作失败',
      details: error?.message || '未知错误'
    }, { status: 500 });
  }
}
