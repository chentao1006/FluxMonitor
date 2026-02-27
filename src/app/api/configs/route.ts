import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

const HOME = os.homedir();

const CONFIG_FILES = [
  { id: 'hosts', name: 'Hosts 文件', path: '/etc/hosts', type: 'system' },
  { id: 'zprofile', name: '.zprofile', path: path.join(HOME, '.zprofile'), type: 'user' },
  { id: 'zshrc', name: '.zshrc', path: path.join(HOME, '.zshrc'), type: 'user' },
  { id: 'bash_profile', name: '.bash_profile', path: path.join(HOME, '.bash_profile'), type: 'user' },
  { id: 'bashrc', name: '.bashrc', path: path.join(HOME, '.bashrc'), type: 'user' },
  { id: 'ssh_config', name: 'SSH Config', path: path.join(HOME, '.ssh/config'), type: 'user' },
  { id: 'ssh_authorized_keys', name: 'SSH Authorized Keys', path: path.join(HOME, '.ssh/authorized_keys'), type: 'user' },
  { id: 'gitconfig', name: 'Git Config', path: path.join(HOME, '.gitconfig'), type: 'user' },
  { id: 'npmrc', name: 'NPM Config', path: path.join(HOME, '.npmrc'), type: 'user' },
  { id: 'vimrc', name: '.vimrc', path: path.join(HOME, '.vimrc'), type: 'user' },
  { id: 'nginx_conf', name: 'Nginx Config', path: '/etc/nginx/nginx.conf', type: 'system' },
  { id: 'nginx_conf_brew', name: 'Nginx Config (Brew)', path: '/opt/homebrew/etc/nginx/nginx.conf', type: 'system' },
  { id: 'pf_conf', name: 'PF Firewall Config', path: '/etc/pf.conf', type: 'system' },
  { id: 'resolv_conf', name: 'DNS Config (resolv.conf)', path: '/etc/resolv.conf', type: 'system' },
];

export async function GET() {
  try {
    const availableConfigs = CONFIG_FILES.filter(config => existsSync(config.path));
    return NextResponse.json({ success: true, data: availableConfigs });
  } catch (error: any) {
    return NextResponse.json({ error: '获取配置列表失败', details: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { action, id, content } = await request.json();

    const config = CONFIG_FILES.find(c => c.id === id);
    if (!config) {
      return NextResponse.json({ error: '未找到该配置' }, { status: 404 });
    }

    if (action === 'read') {
      try {
        const data = await fs.readFile(config.path, 'utf-8');
        return NextResponse.json({ success: true, content: data });
      } catch (error: any) {
        return NextResponse.json({ error: `读取文件失败: ${error.message}` }, { status: 500 });
      }
    }

    if (action === 'write') {
      try {
        await fs.writeFile(config.path, content || '', 'utf-8');
        return NextResponse.json({ success: true });
      } catch (error: any) {
        if (error.code === 'EACCES') {
          return NextResponse.json({ error: '权限不足，无法写入该文件。可能需要 sudo 权限。' }, { status: 403 });
        }
        return NextResponse.json({ error: `写入文件失败: ${error.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: '操作失败', details: error.message }, { status: 500 });
  }
}
