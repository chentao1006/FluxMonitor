import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

async function getNginxDirs() {
  const possibleAvailableDirs = [
    '/opt/homebrew/etc/nginx/sites-available',
    '/etc/nginx/sites-available',
    '/usr/local/etc/nginx/sites-available',
    '/opt/homebrew/etc/nginx/servers',
    '/usr/local/etc/nginx/servers',
    '/etc/nginx/conf.d'
  ];

  let availableDir = '';
  // find first existing dir
  for (const dir of possibleAvailableDirs) {
    if (existsSync(dir)) {
      availableDir = dir;
      break;
    }
  }

  if (!availableDir) {
    availableDir = '/usr/local/etc/nginx/servers';
    await fs.mkdir(availableDir, { recursive: true });
  }

  let enabledDir = null;
  if (availableDir.endsWith('sites-available')) {
    const maybeEnabled = availableDir.replace('sites-available', 'sites-enabled');
    if (existsSync(maybeEnabled)) {
      enabledDir = maybeEnabled;
    }
  }

  return { availableDir, enabledDir };
}
export async function GET() {
  try {
    const { availableDir, enabledDir } = await getNginxDirs();
    let files: string[] = [];
    try {
      files = await fs.readdir(availableDir);
    } catch {
      files = [];
    }
    // filter out hidden files like .DS_Store
    const siteFiles = files.filter(f => !f.startsWith('.'));

    const sites = await Promise.all(siteFiles.map(async (filename) => {
      const filePath = path.join(availableDir, filename);
      let content = '';
      try {
        content = await fs.readFile(filePath, 'utf-8');
      } catch {
        // Ignore read errors
      }

      // Extract port using regex
      const portMatch = content.match(/listen\s+(?:[^:]+?:)?(\d+)/i);
      const port = portMatch ? portMatch[1] : '80';

      const serverNameMatch = content.match(/server_name\s+([^;]+);/i);
      const serverName = serverNameMatch ? serverNameMatch[1].trim() : '-';

      // Check status
      let status = 'enabled';
      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        status = existsSync(enabledFile) ? 'enabled' : 'disabled';
      } else {
        // If there's no sites-enabled dir, assume .conf files are enabled and others are not,
        // or just assume all are enabled if it's the `servers` directory.
        if (filename.endsWith('.conf') || availableDir.includes('servers')) {
          status = 'enabled';
        } else {
          status = 'disabled';
        }
      }

      return {
        name: filename,
        port,
        serverName,
        status,
      };
    }));

    return NextResponse.json({ success: true, data: sites, dir: availableDir });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: '获取站点失败', details: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, filename, content } = await request.json();
    if (!action || !filename) {
      return NextResponse.json({ error: '缺少参数' }, { status: 400 });
    }

    const { availableDir, enabledDir } = await getNginxDirs();
    const filePath = path.join(availableDir, filename);

    if (!filePath.startsWith(availableDir)) {
      return NextResponse.json({ error: '非法路径' }, { status: 400 });
    }

    if (action === 'read') {
      const data = await fs.readFile(filePath, 'utf-8');
      return NextResponse.json({ success: true, content: data });
    }

    if (action === 'write') {
      await fs.writeFile(filePath, content || '', 'utf-8');

      // Auto-symlink if sites-enabled exists
      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        if (!existsSync(enabledFile)) {
          try {
            await fs.symlink(filePath, enabledFile);
          } catch (e) {
            // Ignore if already linked or permission denied
            // Could also use executeNginxCmd style for symlink if sudo is needed, but typically these dirs are user-owned for homebrew
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      await fs.unlink(filePath);

      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        if (existsSync(enabledFile)) {
          try {
            await fs.unlink(enabledFile);
          } catch (e) { }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: '操作失败', details: err?.message }, { status: 500 });
  }
}
