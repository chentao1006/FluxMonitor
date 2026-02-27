import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { prompt, systemPrompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: '缺少 Prompt' }, { status: 400 });
    }

    const configPath = path.join(process.cwd(), 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const aiConfig = config.ai || { url: 'https://api.openai.com/v1/v1', key: '', model: 'gpt-4o-mini' };

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
