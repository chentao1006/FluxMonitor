import { NextResponse } from 'next/server';
import { getConfig } from '@/lib/config';

export async function POST(request: Request) {
  try {
    const { prompt, systemPrompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: 'MISSING_PROMPT' }, { status: 400 });
    }

    const config = getConfig();
    const aiConfig = config.ai;

    if (!aiConfig?.key) {
      return NextResponse.json({ error: 'AI_CONFIG_MISSING' }, { status: 400 });
    }

    // Support both base URL (without /chat/completions) and full URL
    let apiUrl = aiConfig.url;
    if (apiUrl && !apiUrl.endsWith('/chat/completions')) {
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
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: 'AI_REQUEST_FAILED', details: `${res.status} ${text}` }, { status: 500 });
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
