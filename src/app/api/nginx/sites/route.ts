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

  const possibleMainConfigs = [
    '/opt/homebrew/etc/nginx/nginx.conf',
    '/etc/nginx/nginx.conf',
    '/usr/local/etc/nginx/nginx.conf'
  ];

  let mainConfig = '';
  for (const conf of possibleMainConfigs) {
    if (existsSync(conf)) {
      mainConfig = conf;
      break;
    }
  }

  return { availableDir, enabledDir, mainConfig };
}
export async function GET() {
  try {
    const { availableDir, enabledDir, mainConfig } = await getNginxDirs();
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
      const portMatch = content.match(/^[ \t]*listen\s+(?:\[.*?\]:|[^;:\s]+:)?(\d+)/im);
      const port = portMatch ? portMatch[1] : '80';

      const serverNameMatch = content.match(/server_name\s+([^;]+);/i);
      const serverName = serverNameMatch ? serverNameMatch[1].trim() : '-';

      // Check status
      let status = 'enabled';
      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        status = existsSync(enabledFile) ? 'enabled' : 'disabled';
      } else {
        // If there's no sites-enabled dir, check extension
        if (filename.endsWith('.disabled')) {
          status = 'disabled';
        } else if (filename.endsWith('.conf') || availableDir.includes('servers')) {
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

    return NextResponse.json({
      success: true,
      data: sites,
      dir: availableDir,
      hasMainConfig: !!mainConfig
    });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: 'FETCH_SITES_FAILED', details: err?.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, filename, content } = await request.json();
    if (!action || !filename) {
      return NextResponse.json({ error: 'MISSING_PARAMS' }, { status: 400 });
    }

    const { availableDir, enabledDir, mainConfig } = await getNginxDirs();
    let filePath = '';

    if (filename === 'nginx.conf' && mainConfig) {
      filePath = mainConfig;
    } else {
      filePath = path.join(availableDir, filename);
      if (!filePath.startsWith(availableDir)) {
        return NextResponse.json({ error: 'ILLEGAL_PATH' }, { status: 400 });
      }
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
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      // Delete the main file if it exists
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
      }

      // Also delete the .disabled version if it exists
      const disabledPath = filePath + '.disabled';
      if (existsSync(disabledPath)) {
        await fs.unlink(disabledPath);
      }

      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        if (existsSync(enabledFile)) {
          try {
            await fs.unlink(enabledFile);
          } catch (e) { }
        }

        // Also check if there's a enabledFile with .disabled suffix (though unlikely in enabledDir)
        const enabledDisabledFile = enabledFile + '.disabled';
        if (existsSync(enabledDisabledFile)) {
          try {
            await fs.unlink(enabledDisabledFile);
          } catch (e) { }
        }
      }

      return NextResponse.json({ success: true });
    }

    if (action === 'enable') {
      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        if (!existsSync(enabledFile)) {
          await fs.symlink(filePath, enabledFile);
        }
      } else if (filename.endsWith('.disabled')) {
        const newFilename = filename.replace('.disabled', '');
        const newPath = path.join(availableDir, newFilename);
        await fs.rename(filePath, newPath);
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'disable') {
      if (enabledDir) {
        const enabledFile = path.join(enabledDir, filename);
        if (existsSync(enabledFile)) {
          await fs.unlink(enabledFile);
        }
      } else if (!filename.endsWith('.disabled')) {
        const newPath = filePath + '.disabled';
        await fs.rename(filePath, newPath);
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'INVALID_ACTION' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: 'ACTION_FAILED', details: err?.message }, { status: 500 });
  }
}
