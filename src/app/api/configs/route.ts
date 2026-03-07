import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const HOME = os.homedir();

const CONFIG_FILES = [
  // --- System Configs ---
  { id: 'hosts', name: 'Hosts File', path: '/etc/hosts', type: 'system' },
  { id: 'sshd_config', name: 'SSH Server Config', path: '/etc/ssh/sshd_config', type: 'system' },
  { id: 'resolv_conf', name: 'DNS Config (resolv.conf)', path: '/etc/resolv.conf', type: 'system' },
  { id: 'pf_conf', name: 'PF Firewall Config', path: '/etc/pf.conf', type: 'system' },
  { id: 'sysctl_conf', name: 'Kernel Parameters (sysctl)', path: '/etc/sysctl.conf', type: 'system' },
  { id: 'fstab', name: 'File System Mounts (fstab)', path: '/etc/fstab', type: 'system' },
  { id: 'nginx_conf', name: 'Nginx Config', path: '/etc/nginx/nginx.conf', type: 'system' },
  { id: 'nginx_conf_brew', name: 'Nginx Config (Brew)', path: '/opt/homebrew/etc/nginx/nginx.conf', type: 'system' },
  { id: 'redis_conf', name: 'Redis Config (Brew)', path: '/opt/homebrew/etc/redis.conf', type: 'system' },
  { id: 'mysql_conf', name: 'MySQL Config', path: '/etc/my.cnf', type: 'system' },
  { id: 'apache_conf', name: 'Apache Config', path: '/private/etc/apache2/httpd.conf', type: 'system' },

  // --- User Shell Configs ---
  { id: 'zprofile', name: 'Zsh Profile (.zprofile)', path: path.join(HOME, '.zprofile'), type: 'user' },
  { id: 'zshrc', name: 'Zsh Config (.zshrc)', path: path.join(HOME, '.zshrc'), type: 'user' },
  { id: 'bash_profile', name: 'Bash Profile (.bash_profile)', path: path.join(HOME, '.bash_profile'), type: 'user' },
  { id: 'bashrc', name: 'Bash Config (.bashrc)', path: path.join(HOME, '.bashrc'), type: 'user' },
  { id: 'hushlogin', name: 'Login Silence (.hushlogin)', path: path.join(HOME, '.hushlogin'), type: 'user' },

  // --- Developer Tool Configs ---
  { id: 'gitconfig', name: 'Git Global Config', path: path.join(HOME, '.gitconfig'), type: 'user' },
  { id: 'gitignore_global', name: 'Git Global Ignore', path: path.join(HOME, '.gitignore_global'), type: 'user' },
  { id: 'ssh_config', name: 'SSH Client Config', path: path.join(HOME, '.ssh/config'), type: 'user' },
  { id: 'ssh_known_hosts', name: 'SSH Known Hosts', path: path.join(HOME, '.ssh/known_hosts'), type: 'user' },
  { id: 'ssh_authorized_keys', name: 'SSH Authorized Keys', path: path.join(HOME, '.ssh/authorized_keys'), type: 'user' },
  { id: 'npmrc', name: 'NPM Config (.npmrc)', path: path.join(HOME, '.npmrc'), type: 'user' },
  { id: 'yarnrc', name: 'Yarn Config (.yarnrc)', path: path.join(HOME, '.yarnrc'), type: 'user' },
  { id: 'docker_config', name: 'Docker Client Config', path: path.join(HOME, '.docker/config.json'), type: 'user' },
  { id: 'vimrc', name: 'Vim Config (.vimrc)', path: path.join(HOME, '.vimrc'), type: 'user' },
  { id: 'tmux_conf', name: 'Tmux Config (.tmux.conf)', path: path.join(HOME, '.tmux.conf'), type: 'user' },
  { id: 'editorconfig', name: 'EditorConfig', path: path.join(HOME, '.editorconfig'), type: 'user' },
  { id: 'prettierrc', name: 'Prettier Config', path: path.join(HOME, '.prettierrc'), type: 'user' },
  { id: 'condarc', name: 'Conda Config (.condarc)', path: path.join(HOME, '.condarc'), type: 'user' },
];

export async function GET() {
  try {
    const availableConfigs = CONFIG_FILES.filter(config => existsSync(config.path));
    return NextResponse.json({ success: true, data: availableConfigs });
  } catch (error: any) {
    return NextResponse.json({ error: 'FETCH_FAILED', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, id, content } = await request.json();

    const config = CONFIG_FILES.find(c => c.id === id);
    if (!config) {
      return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    }

    if (action === 'read') {
      try {
        const data = await fs.readFile(config.path, 'utf-8');
        return NextResponse.json({ success: true, content: data });
      } catch (error: any) {
        return NextResponse.json({ error: 'READ_FAILED', details: error.message }, { status: 500 });
      }
    }

    if (action === 'write') {
      try {
        await fs.writeFile(config.path, content || '', 'utf-8');
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'EACCES') {
          return NextResponse.json({ error: 'PERMISSION_DENIED' }, { status: 403 });
        }
        return NextResponse.json({ error: 'WRITE_FAILED', details: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: 'ACTION_FAILED', details: error.message }, { status: 500 });
  }
}
