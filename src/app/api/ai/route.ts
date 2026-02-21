import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt, systemPrompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: '缺少 Prompt' }, { status: 400 });
    }

    const res = await fetch('https://api.openai.com/v1/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // or gpt-3.5-turbo if the compatible format uses standard models
        messages: [
          { role: 'system', content: systemPrompt || 'You are an expert system administrator.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2
      })
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `AI 请求失败: ${res.status} ${text}` }, { status: 500 });
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
    return NextResponse.json({ error: 'AI 请求执行失败', details: err?.message }, { status: 500 });
  }
}
