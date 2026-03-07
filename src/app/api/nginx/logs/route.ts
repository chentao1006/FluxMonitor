import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'error'; // 'error' or 'access'
  const lines = parseInt(searchParams.get('lines') || '100');

  try {
    // 1. Try to find nginx log directory
    let logDir = '/usr/local/var/log/nginx';
    if (!fs.existsSync(logDir)) {
      logDir = '/opt/homebrew/var/log/nginx';
    }
    if (!fs.existsSync(logDir)) {
      logDir = '/var/log/nginx';
    }

    const logFile = `${logDir}/${type}.log`;

    if (!fs.existsSync(logFile)) {
      // Try to find it via nginx -V
      try {
        const { stderr } = await execAsync('nginx -V');
        const match = stderr.match(/--error-log-path=([^\s]+)/);
        if (match && match[1]) {
          const path = type === 'error' ? match[1] : match[1].replace('error.log', 'access.log');
          if (fs.existsSync(path)) {
            const { stdout } = await execAsync(`tail -n ${lines} ${path}`);
            return NextResponse.json({ success: true, logs: stdout });
          }
        }
      } catch (e) {
        // ignore
      }
      return NextResponse.json({ success: false, error: 'LOG_FILE_NOT_FOUND' });
    }

    // Use tail to get the last N lines
    const { stdout } = await execAsync(`tail -n ${lines} ${logFile}`);
    return NextResponse.json({ success: true, logs: stdout });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
