import { NextResponse } from 'next/server';
import { spawn } from 'child_process';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Spawn openclaw logs --follow
      // It's possible the binary is in common paths like /usr/local/bin or Homebrew so we set shell: true to resolve PATH easily
      // However, shell: true makes killing children harder. We'll try directly spawning openclaw first, and fallback if error.
      const child = spawn('openclaw', ['logs', '--follow'], {
        env: process.env,
        // using shell ensures PATH is resolved correctly just like exec
        shell: true
      });

      child.stdout.on('data', (data) => {
        const text = data.toString();
        // The SSE payload should be correctly formatted strings
        // Since logs can contain newlines, we can send them as a single JSON encoded data line
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(text)}\n\n`));
      });

      child.on('error', (err) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(`Error: ${err.message}`)}\n\n`));
        controller.close();
      });

      child.on('close', (code) => {
        try {
          controller.enqueue(encoder.encode(`event: end\ndata: ${code || 0}\n\n`));
          setTimeout(() => {
            try { controller.close(); } catch { }
          }, 100);
        } catch { }
      });

      // When the client disconnects, stop following the logs
      request.signal.addEventListener('abort', () => {
        child.kill();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
