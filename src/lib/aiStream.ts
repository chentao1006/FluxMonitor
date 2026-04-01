import { AIConfig } from "./types";

export async function streamAiContent(
  payload: { prompt: string; systemPrompt?: string; config?: Partial<AIConfig> },
  onChunk: (chunk: string) => void,
  onDone?: () => void,
  onError?: (error: string) => void
) {
  try {
    const aiConfig = payload.config;
    
    if (!aiConfig?.key) {
      onError?.('AI_CONFIG_MISSING');
      return;
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
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${aiConfig.key}`
      },
      body: JSON.stringify({
        model: aiConfig.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: payload.systemPrompt || 'You are an expert system administrator.' },
          { role: 'user', content: payload.prompt }
        ],
        temperature: 0.2,
        stream: true
      })
    });

    if (!res.ok) {
      let errStr = res.statusText;
      try {
        const errJson = await res.json();
        errStr = errJson.details || errJson.error || errStr;
        if (typeof errStr === 'object') errStr = JSON.stringify(errStr);
      } catch {
        try {
          const errText = await res.text();
          errStr = errText || errStr;
        } catch {
          // ignore
        }
      }
      onError?.(errStr);
      return;
    }

    if (!res.body) {
      onError?.('NO_STREAM_BODY');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    
    let fullText = '';
    let buffer = '';

    
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\n\n+/);
      buffer = events.pop() || '';
      
      for (const event of events) {
        if (!event.trim()) continue;
        
        const dataStr = event.replace(/^data:\s*/gm, '').trim();
        if (!dataStr || dataStr === '[DONE]') continue;
        
        try {
          const data = JSON.parse(dataStr);
          
          if (data.error) {
            const errorMsg = data.error.message || JSON.stringify(data.error);
            onError?.(`AI Error: ${errorMsg}`);
            return; // Terminate if we get an explicit error chunk
          }
          
          if (typeof data.content === 'string') {
            if (data.content.trim() !== '') {
              fullText = data.content;
              onChunk(fullText);
            }
          } else {
            const delta = data.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta !== '') {
              fullText += delta;
              onChunk(fullText);
            }
          }
        } catch (e) {
          // ignore incomplete/malformed chunks
        }
      }
    }
    
    // Process final buffer
    buffer = buffer.trim();
    if (buffer) {
      const dataStr = buffer.replace(/^data:\s*/gm, '').trim();
      if (dataStr && dataStr !== '[DONE]') {
         try {
           const data = JSON.parse(dataStr);
           if (typeof data.content === 'string') {
             fullText = data.content;
           } else {
             const delta = data.choices?.[0]?.delta?.content;
             if (typeof delta === 'string') fullText += delta;
           }
         } catch(e){}
      }
    }

    onChunk(fullText);
    onDone?.();
  } catch (e: any) {
    onError?.(e.message || 'Stream fetch failed');
  }
}
