import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

// Dynamically augment PATH with likely Node.js global bin paths (NVM, etc.)
let dynamicPaths = '';
try {
  const nvmVersionsDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    const dirs = fs.readdirSync(nvmVersionsDir).filter(d => d.startsWith('v')).sort().reverse();
    dynamicPaths = dirs.map(d => path.join(nvmVersionsDir, d, 'bin')).join(':');
  }

  // Also include bun, fnm, and common others just in case
  const extraPaths = [
    path.join(os.homedir(), '.fnm', 'current', 'bin'),
    path.join(os.homedir(), '.bun', 'bin'),
    path.join(os.homedir(), '.local', 'bin')
  ].filter(fs.existsSync).join(':');

  if (extraPaths) {
    dynamicPaths = dynamicPaths ? `${dynamicPaths}:${extraPaths}` : extraPaths;
  }
} catch (e) {
  // Ignore
}
const COMMON_PATH = `/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin${dynamicPaths ? ':' + dynamicPaths : ''}`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, logPath, command, path: targetPath, content } = body;

    const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
    const CONFIG_PATH = path.join(OPENCLAW_DIR, 'openclaw.json');

    let WORKSPACE_DIR = path.join(OPENCLAW_DIR, 'workspace');
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        if (config?.agents?.defaults?.workspace) {
          let customWorkspace = config.agents.defaults.workspace;
          if (customWorkspace.startsWith('~')) {
            customWorkspace = path.join(os.homedir(), customWorkspace.slice(1));
          } else if (!path.isAbsolute(customWorkspace)) {
            customWorkspace = path.resolve(OPENCLAW_DIR, customWorkspace);
          }
          WORKSPACE_DIR = customWorkspace;
        }
      }
    } catch (e) {
      // Ignore parse errors, fallback to default
    }

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
      // Security check: ensure path is within .openclaw or custom workspace
      if (!targetPath.startsWith(OPENCLAW_DIR) && !targetPath.startsWith(WORKSPACE_DIR)) {
        return NextResponse.json({ error: 'INVALID_PATH' }, { status: 403 });
      }
      const data = fs.readFileSync(targetPath, 'utf-8');
      return NextResponse.json({ success: true, content: data });
    }

    if (action === 'save_memory') {
      if (!targetPath) return NextResponse.json({ error: 'PATH_REQUIRED' }, { status: 400 });
      if (!targetPath.startsWith(OPENCLAW_DIR) && !targetPath.startsWith(WORKSPACE_DIR)) {
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
      if (!targetPath.startsWith(OPENCLAW_DIR) && !targetPath.startsWith(WORKSPACE_DIR)) {
        return NextResponse.json({ error: 'INVALID_PATH' }, { status: 403 });
      }
      if (!fs.existsSync(targetPath)) {
        return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
      }
      fs.unlinkSync(targetPath);
      return NextResponse.json({ success: true });
    }

    if (action === 'search_memory') {
      const { query } = body;
      if (!query) return NextResponse.json({ success: true, files: [] });

      const results: any[] = [];
      const searchInDir = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        try {
          const list = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.md'));
          for (const f of list) {
            const fullPath = path.join(dir, f);
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              if (content.toLowerCase().includes(query.toLowerCase())) {
                const stats = fs.statSync(fullPath);
                results.push({
                  name: f,
                  path: fullPath,
                  size: stats.size,
                  mtime: stats.mtime
                });
              }
            } catch (e) { /* skip unreadable files */ }
          }
        } catch (e) { /* skip unreadable dirs */ }
      };

      searchInDir(MEMORY_DIR);
      if (WORKSPACE_DIR !== MEMORY_DIR) {
        searchInDir(WORKSPACE_DIR);
      }

      // De-duplicate results by path
      const uniqueResults = Array.from(new Map(results.map(item => [item.path, item])).values());
      
      return NextResponse.json({ success: true, files: uniqueResults });
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
          const { stdout: vOut, stderr: vErr } = await execAsync('openclaw -V', {
            timeout: 5000,
            env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
          });
          const output = (vOut || vErr || '').trim();
          if (output) {
            const lines = output.split('\n');
            const versionLine = lines.find((l: string) => !l.toLowerCase().includes('not found') && !l.toLowerCase().includes('no such'));
            version = versionLine ? versionLine.trim() : 'Unknown';
          }
        } catch (ve: any) {
          const output = (ve.stdout || ve.stderr || '').trim();
          if (output) {
            const lines = output.split('\n');
            const versionLine = lines.find((l: string) => !l.toLowerCase().includes('not found') && !l.toLowerCase().includes('no such'));
            version = versionLine ? versionLine.trim() : 'Unknown';
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

    if (action === 'add_cron' || action === 'edit_cron') {
      const { task } = body;
      if (!task) return NextResponse.json({ error: 'TASK_REQUIRED' }, { status: 400 });

      // Build command: openclaw cron add/edit <id> --name "..." --cron "..." --message "..."
      const subCommand = action === 'add_cron' ? 'add' : `edit ${task.id}`;
      let cmdLine = `openclaw cron ${subCommand}`;

      if (task.name) cmdLine += ` --name "${task.name.replace(/"/g, '\\"')}"`;
      if (task.schedule?.expr) cmdLine += ` --cron "${task.schedule.expr}"`;
      if (task.payload?.message) cmdLine += ` --message "${task.payload.message.replace(/"/g, '\\"')}"`;
      if (task.sessionTarget) cmdLine += ` --session ${task.sessionTarget}`;
      
      if (task.delivery?.channel && task.delivery.channel !== 'none') {
        cmdLine += ` --announce --channel ${task.delivery.channel}`;
        if (task.delivery.to) cmdLine += ` --to "${task.delivery.to.replace(/"/g, '\\"')}"`;
      } else {
        cmdLine += ' --no-deliver';
      }

      try {
        const { stdout, stderr } = await execAsync(cmdLine, {
          timeout: 10000,
          env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
        });
        return NextResponse.json({ success: true, stdout, stderr });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: 'CLI_EXEC_FAILED', details: e.message, stderr: e.stderr });
      }
    }

    if (action === 'remove_cron') {
      const { id } = body;
      try {
        await execAsync(`openclaw cron remove ${id}`, {
          env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
        });
        return NextResponse.json({ success: true });
      } catch (e: any) {
        return NextResponse.json({ success: false, error: 'REMOVE_FAILED', details: e.message });
      }
    }

    if (action === 'toggle_cron') {
      const { id, enabled } = body;
      const sub = enabled ? 'enable' : 'disable';
      try {
        await execAsync(`openclaw cron ${sub} ${id}`, {
          env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
        });
        return NextResponse.json({ success: true });
      } catch (e: any) {
        // Fallback: if enable/disable not supported, try edit --enabled
        return NextResponse.json({ success: false, error: 'TOGGLE_FAILED', details: e.message });
      }
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({
      error: 'ACTION_FAILED',
      details: error?.message || 'UNKNOWN_ERROR'
    }, { status: 500 });
  }
}
