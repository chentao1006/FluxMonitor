import { spawn } from 'child_process';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { command } = await request.json();

    if (!command) {
      return new Response(JSON.stringify({ error: '命令不能为空' }), { status: 400 });
    }

    const COMMON_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin';
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
      error: '命令执行过程中发生错误',
      details: error?.message || '未知错误'
    }), { status: 500 });
  }
}
