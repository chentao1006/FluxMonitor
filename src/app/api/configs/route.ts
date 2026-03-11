import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';
import { getConfig, saveConfig } from '@/lib/config';

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.config');

interface ConfigItem {
  id: string;
  name: string;
  path: string;
  type: string;
  category: string;
  size?: number;
  mtime?: number;
  isCustom?: boolean;
}

// Predefined configs with categories
const PREDEFINED_CONFIGS: ConfigItem[] = [
  // --- System Configs ---
  { id: 'hosts', name: 'Hosts File', path: '/etc/hosts', type: 'system', category: 'System' },
  { id: 'resolv_conf', name: 'DNS (resolv.conf)', path: '/etc/resolv.conf', type: 'system', category: 'System' },
  { id: 'sshd_config', name: 'SSH Server Config', path: '/etc/ssh/sshd_config', type: 'system', category: 'System' },
  { id: 'pf_conf', name: 'PF Firewall', path: '/etc/pf.conf', type: 'system', category: 'System' },
  { id: 'nginx_conf', name: 'Nginx Config', path: '/etc/nginx/nginx.conf', type: 'system', category: 'Web Server' },
  { id: 'nginx_conf_brew', name: 'Nginx (Brew)', path: '/opt/homebrew/etc/nginx/nginx.conf', type: 'system', category: 'Web Server' },
  { id: 'nginx_conf_local', name: 'Nginx (Local)', path: '/usr/local/etc/nginx/nginx.conf', type: 'system', category: 'Web Server' },
  { id: 'redis_conf', name: 'Redis (Brew)', path: '/opt/homebrew/etc/redis.conf', type: 'system', category: 'Database' },
  { id: 'mysql_conf', name: 'MySQL Config', path: '/etc/my.cnf', type: 'system', category: 'Database' },
  { id: 'apache_conf', name: 'Apache Config', path: '/private/etc/apache2/httpd.conf', type: 'system', category: 'Web Server' },
];

function getCategory(fullPath: string, fileName: string): string {
  const lowPath = fullPath.toLowerCase();
  const lowName = fileName.toLowerCase();

  if (lowName.includes('rc') || lowName.includes('profile') || lowName.includes('alias') || lowName.includes('zsh') || lowName.includes('bash') || lowName.includes('vim') || lowName.includes('git')) {
    return 'Shell & CLI';
  }
  if (lowPath.includes('nginx') || lowPath.includes('apache') || lowPath.includes('caddy') || lowPath.includes('httpd')) {
    return 'Web Server';
  }
  if (lowPath.includes('mysql') || lowPath.includes('redis') || lowPath.includes('mongo') || lowPath.includes('postgres') || lowPath.includes('sql')) {
    return 'Database';
  }
  if (lowPath.includes('docker') || lowPath.includes('aws') || lowPath.includes('cloudflared') || lowPath.includes('.ssh') || lowPath.includes('kube') || lowPath.includes('npm') || lowPath.includes('node')) {
    return 'Dev Tools';
  }
  if (lowPath.startsWith('/etc/') || lowPath.includes('system') || lowPath.includes('plist')) {
    return 'System';
  }
  return 'Other';
}

async function scanConfigs() {
  const configs = [...PREDEFINED_CONFIGS];
  const seenPaths = new Set(configs.map(c => c.path));

  const scanDir = async (dir: string, maxDepth = 1, currentDepth = 0) => {
    // Add custom configs from config.json
    const configData = getConfig();
    const customConfigs = configData.customConfigs || [];
    for (const customPath of customConfigs) {
      if (!seenPaths.has(customPath) && existsSync(customPath)) {
        try {
          const stat = await fs.stat(customPath);
          const name = path.basename(customPath);
          configs.push({
            id: customPath,
            name: name,
            path: customPath,
            size: stat.size,
            mtime: stat.mtime.getTime(),
            type: 'user',
            category: getCategory(customPath, name),
            isCustom: true
          });
          seenPaths.add(customPath);
        } catch (e) { }
      }
    }

    if (currentDepth > maxDepth) return;
    try {
      if (!existsSync(dir)) return;
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const fullPath = path.join(dir, entry.name);
        if (seenPaths.has(fullPath)) continue;

        const name = entry.name;
        const lowName = name.toLowerCase();

        // Refined Skip patterns
        if (
          lowName === '.ds_store' ||
          lowName === '.localized' ||
          lowName.startsWith('.bash_sessions') ||
          lowName.includes('history') ||
          lowName.endsWith('.log') ||
          lowName.endsWith('.tmp') ||
          lowName.endsWith('.bak') ||
          lowName.endsWith('.swp') ||
          lowName.endsWith('.token') ||
          lowName.endsWith('.pid') ||
          lowName.includes('timestamp') ||
          lowName.includes('lastused') ||
          lowName.startsWith('.update') ||
          lowName.includes('%') || // URL encoded names
          lowName.includes(':') || // Docker-style names
          lowName === '.git' ||
          lowName === '.node_repl_history' ||
          lowName === '.viminfo' ||
          lowName === '.lesshst' ||
          lowName === '.npm' ||
          lowName === '.zcompdump' ||
          /^[0-9a-f]{20,}/i.test(name) || // Long hex hashes
          /^\.[0-9a-f]{20,}/i.test(name)   // Hidden long hex hashes
        ) continue;

        // Refined Include patterns
        const isConfig =
          (name.startsWith('.') && (lowName.endsWith('rc') || lowName.includes('profile') || lowName.includes('config'))) ||
          lowName.includes('config') ||
          lowName.includes('rc') ||
          lowName.endsWith('.conf') ||
          lowName.endsWith('.plist') ||
          lowName.endsWith('.json') ||
          lowName.endsWith('.yaml') ||
          lowName.endsWith('.yml') ||
          lowName.endsWith('.toml') ||
          ['.zshrc', '.bashrc', '.vimrc', '.nanorc', '.gitconfig'].includes(lowName);

        if (isConfig) {
          const stat = await fs.stat(fullPath);
          configs.push({
            id: fullPath,
            name: name,
            path: fullPath,
            size: stat.size,
            mtime: stat.mtime.getTime(),
            type: 'user',
            category: getCategory(fullPath, name),
            isCustom: customConfigs.some((cp: string) => cp === fullPath || cp.replace(/^~/, HOME) === fullPath)
          });
          seenPaths.add(fullPath);
        }
      }
    } catch (e) {
      console.error(`Error scanning ${dir}:`, e);
    }
  };

  // Scan Home directory (non-recursive for performance, but specifically check hidden dirs)
  await scanDir(HOME, 0);

  // Scan hidden directories in HOME (like .cloudflared, .aws, etc.)
  try {
    const homeEntries = await fs.readdir(HOME, { withFileTypes: true });
    for (const entry of homeEntries) {
      if (entry.isDirectory() && entry.name.startsWith('.') && !['.git', '.npm', '.cache', '.node-gyp', '.vscode', '.Trash'].includes(entry.name)) {
        await scanDir(path.join(HOME, entry.name), 0);
      }
    }
  } catch (e) { }

  // Scan .config directory if it exists
  if (existsSync(CONFIG_DIR)) {
    await scanDir(CONFIG_DIR, 1);

    try {
      const configSubdirs = await fs.readdir(CONFIG_DIR, { withFileTypes: true });
      for (const subdir of configSubdirs) {
        if (subdir.isDirectory()) {
          await scanDir(path.join(CONFIG_DIR, subdir.name), 0);
        }
      }
    } catch (e) { }
  }

  return configs;
}

export async function GET() {
  try {
    const allConfigs = await scanConfigs();
    const availableConfigs = await Promise.all(allConfigs.filter(config => existsSync(config.path)).map(async config => {
      try {
        const stat = await fs.stat(config.path);
        return {
          ...config,
          size: stat.size,
          mtime: stat.mtime.getTime()
        };
      } catch (e) {
        return config;
      }
    }));
    return NextResponse.json({ success: true, data: availableConfigs, home: HOME });
  } catch (error: any) {
    return NextResponse.json({ error: 'FETCH_FAILED', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, id, content } = await request.json();

    // id can be a predefined ID or a full path
    let configPath = '';
    const predefined = PREDEFINED_CONFIGS.find(c => c.id === id);
    if (predefined) {
      configPath = predefined.path;
    } else if (id) {
      // Expand ~ to HOME if present
      configPath = id.startsWith('~') ? path.join(HOME, id.slice(1)) : id;
      // Handle relative paths or resolve correctly
      if (!path.isAbsolute(configPath) && !id.startsWith('~')) {
        configPath = path.resolve(HOME, configPath);
      }
    }

    if (!configPath || !existsSync(configPath)) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    // Security check: only allow reading files in HOME or predefined paths
    const isAllowedDir =
      configPath.startsWith(HOME) ||
      configPath.startsWith('/etc/') ||
      configPath.startsWith('/opt/homebrew/') ||
      configPath.startsWith('/private/etc/') ||
      configPath.startsWith('/usr/local/etc/') ||
      configPath.startsWith('/usr/local/var/log/') ||
      PREDEFINED_CONFIGS.some(c => c.path === configPath);

    if (!isAllowedDir) {
      return NextResponse.json({ error: 'PERMISSION_DENIED', details: 'Access outside allowed directories' }, { status: 403 });
    }

    if (action === 'read') {
      try {
        const data = await fs.readFile(configPath, 'utf-8');
        return NextResponse.json({ success: true, content: data });
      } catch (error: any) {
        return NextResponse.json({ error: 'READ_FAILED', details: error.message }, { status: 500 });
      }
    }

    if (action === 'write') {
      try {
        await fs.writeFile(configPath, content || '', 'utf-8');
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          return NextResponse.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
        }
        return NextResponse.json({ error: 'WRITE_FAILED', details: error.message }, { status: 500 });
      }
    }

    if (action === 'add') {
      const configData = getConfig();
      const customConfigs = configData.customConfigs || [];
      if (!customConfigs.includes(id)) {
        customConfigs.push(id);
        saveConfig({ ...configData, customConfigs });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'remove') {
      const configData = getConfig();
      const customConfigs = configData.customConfigs || [];
      const newCustomConfigs = customConfigs.filter((p: string) => p !== id);
      saveConfig({ ...configData, customConfigs: newCustomConfigs });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'ACTION_FAILED', details: error.message }, { status: 500 });
  }
}
