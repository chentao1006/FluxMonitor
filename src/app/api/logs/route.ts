import { NextResponse } from 'next/server';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { getConfig, saveConfig } from '@/lib/config';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('file');

  if (filePath) {
    // Read specific file content
    try {
      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
      }

      // Use spawn instead of exec to avoid maxBuffer issues with large files
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = spawn('tail', ['-n', '2000', filePath]);
        let data = '';
        const limit = 50 * 1024 * 1024; // 50MB safe limit

        child.stdout.on('data', (chunk: Buffer) => {
          data += chunk.toString();
          if (data.length > limit) {
            child.kill();
          }
        });

        child.on('close', (code: number) => {
          if (code === 0 || data.length > 0) {
            resolve(data);
          } else {
            reject(new Error(`tail command exited with code: ${code}`));
          }
        });

        child.on('error', reject);

      });

      return NextResponse.json({ success: true, data: stdout });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  }

  // List log files
  try {
    const homeDir = os.homedir();
    const config = getConfig();
    const customPaths = config.customLogs || [];
    
    const logPaths = [
      path.join(homeDir, 'Applications'),
      path.join(homeDir, 'Library/Logs'),
      '/opt/homebrew/var/log',
      '/usr/local/var/log',
      '/var/log',
      path.join(homeDir, '.pm2/logs'),
      ...customPaths.map((p: string) => p.replace(/^~/, homeDir))
    ];

    // Filter existing paths
    const existingPaths = [];
    for (const p of logPaths) {
      try {
        await fs.access(p);
        existingPaths.push(p);
      } catch { }
    }

    if (existingPaths.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Join paths for find command
    const pathsStr = existingPaths.map(p => `"${p}"`).join(' ');

    // Find all .log and nohup.out files in specified directories, up to 5 levels deep
    // Sorting by modification time (most recent first)
    // Redirect stderr to /dev/null to avoid permission errors
    const { stdout } = await execAsync(`find ${pathsStr} -maxdepth 5 \\( -name "*.log" -o -name "nohup.out" -o -name "system.log" \\) -type f -exec stat -f "%m %z %N" {} + 2>/dev/null | sort -rn | head -n 500`, { maxBuffer: 100 * 1024 * 1024 });

    const files = stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(' ');
      const mtime = parts[0];
      const size = parts[1];
      const fullPath = parts.slice(2).join(' ');
      const dirname = path.dirname(fullPath);

      let category = 'other';
      if (fullPath.startsWith('/var/log')) category = 'system';
      else if (fullPath.includes('Library/Logs')) category = 'app';
      else if (fullPath.includes('var/log') || fullPath.includes('.pm2') || fullPath.includes('Applications')) category = 'service';

      return {
        path: fullPath,
        name: path.basename(fullPath),
        dir: dirname.replace(homeDir, '~'),
        category,
        size: parseInt(size),
        mtime: parseInt(mtime) * 1000,
        isCustom: customPaths.some((cp: string) => cp === fullPath || cp.replace(/^~/, homeDir) === fullPath),
      };
    });

    return NextResponse.json({ success: true, data: files });
  } catch (error: unknown) {
    console.error('Logs API error:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { file, action, password } = await request.json();
    if (!file) {
      return NextResponse.json({ success: false, error: 'No file specified' }, { status: 400 });
    }

    const executeWithSudo = async (cmd: string) => {
      if (!password) {
        throw new Error('REQUIRES_SUDO_PASSWORD');
      }
      try {
        await execAsync(`echo "${password}" | sudo -S ${cmd}`);
      } catch (err: unknown) {
        if (err instanceof Error && (err.message.includes('incorrect password') || err.message.includes('Sorry, try again'))) {
          throw new Error('SUDO_AUTH_FAILED');
        }
        throw err;
      }
    };

    try {
      if (action === 'clear') {
        try {
          await fs.writeFile(file, '');
        } catch (e: unknown) {
          if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code && ((e as { code: string }).code === 'EACCES' || (e as { code: string }).code === 'EPERM')) {
            await executeWithSudo(`truncate -s 0 "${file}"`);
          } else throw e;
        }
        return NextResponse.json({ success: true });
      }

      if (action === 'delete') {
        try {
          await fs.unlink(file);
        } catch (e: unknown) {
          if (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code && ((e as { code: string }).code === 'EACCES' || (e as { code: string }).code === 'EPERM')) {
            await executeWithSudo(`rm "${file}"`);
          } else throw e;
        }
        return NextResponse.json({ success: true });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'REQUIRES_SUDO_PASSWORD') {
        return NextResponse.json({ success: false, requiresPassword: true });
      }
      if (err instanceof Error && err.message === 'SUDO_AUTH_FAILED') {
        return NextResponse.json({ success: false, error: 'Wrong password' }, { status: 401 });
      }
      throw err;
    }

      if (action === 'add') {
        const config = getConfig();
        const customLogs = config.customLogs || [];
        if (!customLogs.includes(file)) {
          customLogs.push(file);
          saveConfig({ ...config, customLogs });
        }
        return NextResponse.json({ success: true });
      }

      if (action === 'remove') {
        const config = getConfig();
        const customLogs = config.customLogs || [];
        const newCustomLogs = customLogs.filter((p: string) => p !== file);
        saveConfig({ ...config, customLogs: newCustomLogs });
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
    } catch (err: unknown) {
      console.error('Logs POST error:', err);
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
}
