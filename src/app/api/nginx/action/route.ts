import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: Request) {
  try {
    const { action, password } = await request.json();

    // Find Nginx binary path dynamically
    let NGINX_BIN = 'nginx';
    try {
      const { stdout } = await execAsync('which nginx');
      if (stdout.trim()) {
        NGINX_BIN = stdout.trim();
      }
    } catch {
      // If `which nginx` fails, default to 'nginx' in PATH
    }

    const executeNginxCmd = async (cmd: string) => {
      try {
        if (password) {
          return await execAsync(`echo "${password}" | sudo -S ${cmd}`);
        }
        return await execAsync(cmd);
      } catch (err: unknown) {
        const error = err as Error;
        const msg = error.message || '';

        // If we tried with a password and it failed with incorrect password, throw specific error
        if (password && (msg.includes('incorrect password') || msg.includes('Sorry, try again'))) {
          throw new Error('SUDO_AUTH_FAILED:密码错误');
        }

        if (
          !password && (
            msg.includes('Permission denied') ||
            msg.includes('permission denied') ||
            msg.includes('Operation not permitted') ||
            (msg.includes('bind() to') && msg.includes('failed'))
          )
        ) {
          // Tell the frontend we need a sudo password instead of spawning a GUI prompt 
          // (which would hang or fail if accessed remotely)
          throw new Error('REQUIRES_SUDO_PASSWORD');
        }
        throw error;
      }
    };

    if (action === 'status') {
      try {
        const { stdout } = await execAsync('pgrep nginx');
        const pids = stdout.trim().split('\n');
        return NextResponse.json({ success: true, running: pids.length > 0, pids, binPath: NGINX_BIN });
      } catch {
        return NextResponse.json({ success: true, running: false, pids: [], binPath: NGINX_BIN });
      }
    }

    if (action === 'start') {
      await executeNginxCmd(NGINX_BIN);
      return NextResponse.json({ success: true });
    }

    if (action === 'stop') {
      await executeNginxCmd(`${NGINX_BIN} -s stop`);
      return NextResponse.json({ success: true });
    }

    if (action === 'reload') {
      await executeNginxCmd(`${NGINX_BIN} -s reload`);
      return NextResponse.json({ success: true });
    }

    if (action === 'test') {
      const { stdout, stderr } = await executeNginxCmd(`${NGINX_BIN} -t`);
      return NextResponse.json({ success: true, details: stdout || stderr });
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (error: unknown) {
    const err = error as Error;

    if (err.message === 'REQUIRES_SUDO_PASSWORD') {
      return NextResponse.json({ success: false, requiresPassword: true });
    }

    if (err.message.includes('SUDO_AUTH_FAILED')) {
      return NextResponse.json({ success: false, error: '管理员密码错误，请重试' }, { status: 403 });
    }

    return NextResponse.json({
      error: 'Nginx 操作失败',
      details: err?.message || '未知错误'
    }, { status: 500 });
  }
}
