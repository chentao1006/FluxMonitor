import { spawn } from 'child_process';
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
    const { command } = await request.json();

    if (!command) {
      return new Response(JSON.stringify({ error: 'EMPTY_COMMAND' }), { status: 400 });
    }

    const encoder = new TextEncoder();

    let childProcess: any;
    const stream = new ReadableStream({
      start(controller) {
        childProcess = spawn(command, {
          shell: true,
          env: { ...process.env, PATH: `${COMMON_PATH}:${process.env.PATH || ''}` }
        });

        childProcess.stdout.on('data', (data: any) => {
          controller.enqueue(encoder.encode(data.toString()));
        });

        childProcess.stderr.on('data', (data: any) => {
          controller.enqueue(encoder.encode(data.toString()));
        });

        childProcess.on('error', (error: any) => {
          controller.enqueue(encoder.encode(`\n[Spawn Error]: ${error.message}\n`));
          controller.close();
        });

        childProcess.on('close', (code: any) => {
          if (code !== 0 && code !== null) {
            controller.enqueue(encoder.encode(`\n[Process Exited with Code ${code}]\n`));
          }
          controller.close();
        });
      },
      cancel() {
        if (childProcess) {
          childProcess.kill('SIGINT');
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      error: 'COMMAND_EXEC_ERROR',
      details: error?.message || 'UNKNOWN_ERROR'
    }), { status: 500 });
  }
}
