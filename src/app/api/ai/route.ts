import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const { prompt, systemPrompt, stream } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'MISSING_PROMPT' }, { status: 400 });
    }

    const config = getConfig();
    const aiConfig = config.ai;

    if (!aiConfig?.key) {
      return NextResponse.json({ error: 'AI_CONFIG_MISSING' }, { status: 400 });
    }

    // Support both base URL (without /chat/completions) and full URL
    let apiUrl = aiConfig.url || 'https://api.openai.com/v1';
    if (!apiUrl.endsWith('/chat/completions')) {
      apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';
    }

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(aiConfig.key ? { 'Authorization': `Bearer ${aiConfig.key}` } : {})
      },
      body: JSON.stringify({
        model: aiConfig.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt || 'You are an expert system administrator.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        stream: !!stream
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: 'AI_REQUEST_FAILED', details: `${res.status} ${text}` }, { status: 500 });
    }

    if (stream) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const responseStream = new ReadableStream({
        async start(controller) {
          if (!res.body) {
            controller.close();
            return;
          }
          const reader = res.body.getReader();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.trim() === '') continue;
                if (line.startsWith('data: ')) {
                  const dataStr = line.slice(6).trim();
                  if (dataStr === '[DONE]') continue;

                  try {
                    const data = JSON.parse(dataStr);
                    const content = data.choices?.[0]?.delta?.content || '';
                    if (content) {
                      controller.enqueue(encoder.encode(content));
                    }
                  } catch (e) {
                    // Ignore parse errors on incomplete chunks
                  }
                }
              }
            }
          } catch (err) {
            controller.error(err);
          } finally {
            reader.releaseLock();
            controller.close();
          }
        }
      });

      return new Response(responseStream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || '';

    // Auto stip markdown blocks if content is wrapped in them
    if (content.startsWith('```')) {
      const lines = content.split('\n');
      if (lines.length > 2) {
        lines.shift(); // remove opening ```
        if (lines[lines.length - 1].startsWith('```')) {
          lines.pop(); // remove closing ```
        }
        content = lines.join('\n');
      }
    }

    return NextResponse.json({ success: true, data: content.trim() });
  } catch (error: unknown) {
    const err = error as Error;
    return NextResponse.json({ error: 'AI_EXECUTION_FAILED', details: err?.message }, { status: 500 });
  }
}
