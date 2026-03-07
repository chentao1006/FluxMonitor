import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const COMMON_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin';

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
        return NextResponse.json({ success: true, content: '{}', message: 'CONFIG_NOT_FOUND' });
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
      const files: any[] = [];
      const scanDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const list = fs.readdirSync(dir)
          .filter(f => f.toLowerCase().endsWith('.md'))
          .map(f => {
            const fullPath = path.join(dir, f);
            const stats = fs.statSync(fullPath);
            return {
              name: f,
              path: fullPath,
              size: stats.size,
              mtime: stats.mtime
            };
          });
        files.push(...list);
      };

      // 1. Scan .openclaw/workspace/memory
      scanDir(MEMORY_DIR);

      // 2. Scan .openclaw/workspace (root)
      if (fs.existsSync(WORKSPACE_DIR)) {
        const rootMdFiles = fs.readdirSync(WORKSPACE_DIR)
          .filter(f => f.toLowerCase().endsWith('.md'))
          .map(f => {
            const fullPath = path.join(WORKSPACE_DIR, f);
            // Avoid adding files already scanned in subdirectories if paths overlap (unlikely here but safe)
            if (files.find(existing => existing.path === fullPath)) return null;
            const stats = fs.statSync(fullPath);
            return {
              name: f,
              path: fullPath,
              size: stats.size,
              mtime: stats.mtime
            };
          }).filter(Boolean);
        files.push(...(rootMdFiles as any[]));
      }

      return NextResponse.json({ success: true, files });
    }

    if (action === 'read_memory') {
      if (!targetPath || !fs.existsSync(targetPath)) {
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      // Security check: ensure path is within .openclaw
      if (!targetPath.includes('.openclaw')) {
        return NextResponse.json({ error: 'INVALID_PATH' }, { status: 403 });
      }
      const data = fs.readFileSync(targetPath, 'utf-8');
      return NextResponse.json({ success: true, content: data });
    }

    if (action === 'save_memory') {
      if (!targetPath) return NextResponse.json({ error: 'PATH_REQUIRED' }, { status: 400 });
      if (!targetPath.includes('.openclaw')) {
        return NextResponse.json({ error: 'INVALID_PATH' }, { status: 403 });
      }
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content, 'utf-8');
      return NextResponse.json({ success: true });
    }

    if (action === 'delete_memory') {
      if (!targetPath) return NextResponse.json({ error: 'PATH_REQUIRED' }, { status: 400 });
      if (!targetPath.includes('.openclaw')) {
        return NextResponse.json({ error: 'INVALID_PATH' }, { status: 403 });
      }
      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      fs.unlinkSync(targetPath);
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
          error: 'LOG_NOT_FOUND',
          path: targetPath,
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
        return NextResponse.json({ success: false, error: 'READ_FAILED', details: e.message }, { status: 500 });
      }
    }

    if (action === 'status') {
      try {
        let version = 'Unknown';
        try {
          // Use -l (login) and -i (interactive) to force loading of user profiles and aliases
          // Note: -i might hang if it expects input, so we use -l first
          const { stdout: vOut, stderr: vErr } = await execAsync('bash -l -c "openclaw -V"', {
            timeout: 5000
          });
          version = (vOut || vErr || '').trim().split('\n')[0] || 'Unknown';
        } catch (ve: any) {
          const output = (ve.stdout || ve.stderr || '').trim();
          if (output) {
            // Take the first line that doesn't look like a "command not found" error
            const lines = output.split('\n');
            const versionLine = lines.find((l: string) => !l.toLowerCase().includes('not found') && !l.toLowerCase().includes('no such'));
            version = versionLine ? versionLine.trim() : 'Unknown';
          } else {
            version = 'Unknown';
          }
        }

        // Try the command first
        try {
          const { stdout } = await execAsync('openclaw status', { timeout: 3000, env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` } });
          return NextResponse.json({
            success: true,
            running: stdout.toLowerCase().includes('running'),
            detail: stdout,
            version: version
          });
        } catch (e: any) {
          let detail = e.stdout || e.message || '';

          // Fallback: check the port
          let port = 18789; // Default
          try {
            if (fs.existsSync(CONFIG_PATH)) {
              const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
              if (config?.gateway?.port) port = config.gateway.port;
            }
          } catch (pe) { /* ignore config parse error */ }

          try {
            const { stdout: portCheck } = await execAsync(`lsof -i :${port} -t`, { timeout: 2000 });
            if (portCheck.trim()) {
              return NextResponse.json({
                success: true,
                running: true,
                version: version,
                detail: `Detected running process on port ${port} (PID: ${portCheck.trim()}).\nNote: 'openclaw' command not in PATH.`
              });
            }
          } catch (pe) {
            // Port not occupied
          }

          return NextResponse.json({
            success: true,
            running: false,
            version: version,
            detail: detail.includes('command not found') || detail.includes('not found') ? 'OpenClaw command line tool not found in PATH' : detail
          });
        }
      } catch (e: any) {
        return NextResponse.json({ success: true, running: false, detail: e.message });
      }
    }

    if (action === 'command') {
      if (!command || !command.startsWith('openclaw')) {
        return NextResponse.json({ error: 'SECURITY_VIOLATION', details: 'Command must start with openclaw' }, { status: 400 });
      }

      if (command.includes('--follow') || command.includes('-f ')) {
        return NextResponse.json({ error: 'INTERACTIVE_NOT_SUPPORTED' }, { status: 400 });
      }

      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 15000,
          env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
        });
        return NextResponse.json({ success: true, stdout, stderr });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message, stdout: e.stdout, stderr: e.stderr });
      }
    }

    if (action === 'get_cron') {
      const CRON_PATH = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
      if (!fs.existsSync(CRON_PATH)) {
        return NextResponse.json({ success: true, data: { version: 1, jobs: [] } });
      }
      try {
        const data = fs.readFileSync(CRON_PATH, 'utf-8');
        return NextResponse.json({ success: true, data: JSON.parse(data) });
      } catch (e) {
        return NextResponse.json({ success: true, data: { version: 1, jobs: [] } });
      }
    }

    if (action === 'save_cron') {
      const CRON_DIR = path.join(OPENCLAW_DIR, 'cron');
      const CRON_PATH = path.join(CRON_DIR, 'jobs.json');
      if (!fs.existsSync(CRON_DIR)) {
        fs.mkdirSync(CRON_DIR, { recursive: true });
      }
      fs.writeFileSync(CRON_PATH, JSON.stringify(content, null, 2), 'utf-8');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: 'ACTION_FAILED',
      details: error?.message || 'UNKNOWN_ERROR'
    }, { status: 500 });
  }
}
