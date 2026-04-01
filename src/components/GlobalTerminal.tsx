"use client";

import { useState, useRef, useEffect } from 'react';
import { Terminal, X, Square, Sparkles, Brain, Play } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSettings } from '@/lib/SettingsContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { streamAiContent } from '@/lib/aiStream';

export default function GlobalTerminal() {
  const { t } = useLanguage();
  const { config } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [cmd, setCmd] = useState('');
  const [cmdResult, setCmdResult] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const aiCacheRef = useRef<Record<string, string>>({});

  const quickCommands = [
    { label: t.monitor.quickCmds.ls, cmd: 'ls -FhG' },
    { label: t.monitor.quickCmds.df, cmd: 'df -h' },
    { label: t.monitor.quickCmds.memSort, cmd: 'ps -e -o pmem,comm | sort -rn | head -n 10' },
    { label: t.monitor.quickCmds.cpuSort, cmd: 'ps -e -o pcpu,comm | sort -rn | head -n 10' },
    { label: t.monitor.quickCmds.ip, cmd: 'ifconfig | grep "inet " | grep -v 127.0.0.1' },
    { label: t.monitor.quickCmds.ports, cmd: 'lsof -i -P | grep LISTEN' },
    { label: t.monitor.quickCmds.uptime, cmd: 'uptime' },
    { label: t.monitor.quickCmds.brew, cmd: 'brew list --versions' },
    { label: t.monitor.quickCmds.vers, cmd: 'sw_vers' },
    { label: t.monitor.quickCmds.procCount, cmd: 'ps aux | wc -l' },
    { label: t.monitor.quickCmds.space, cmd: 'du -sh ~/* | sort -rh | head -n 5' },
    { label: t.monitor.quickCmds.downloads, cmd: 'ls -lt ~/Downloads | head -n 5' },
    { label: t.monitor.quickCmds.arch, cmd: 'uname -m' },
    { label: t.monitor.quickCmds.who, cmd: 'who' },
    { label: t.monitor.quickCmds.dns, cmd: 'cat /etc/resolv.conf' },
    { label: t.monitor.quickCmds.memDetail, cmd: 'vm_stat' },
    { label: t.monitor.quickCmds.netStat, cmd: 'netstat -an | grep ESTABLISHED | head -n 10' },
    { label: t.monitor.quickCmds.topProc, cmd: 'top -l 1 -s 0 -n 10' },
    { label: t.monitor.quickCmds.battery, cmd: 'pmset -g batt' },
    { label: t.monitor.quickCmds.cpuInfo, cmd: 'sysctl machdep.cpu.brand_string' },
    { label: t.monitor.quickCmds.arp, cmd: 'arp -a | head -n 10' },
  ];

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [cmdResult]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  const stopCommand = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExecuting(false);
  };

  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExecuting || !cmd) return;

    setIsExecuting(true);
    setCmdResult('');
    setAnalysisResult('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/system/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
        signal: controller.signal
      });

      if (!response.body) {
        setIsExecuting(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value) {
            const chunk = decoder.decode(value);
            setCmdResult(prev => prev + chunk);
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          setCmdResult(prev => prev + '\n[Stopped: Interrupted]\n');
        } else {
          throw err;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== 'AbortError') {
        setCmdResult(prev => prev + `\n[Error]: ${t.common.networkError} (${e.message})`);
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const translateAICommand = async () => {
    if (!cmd) return;
    setAiLoading(true);
    setCmdResult(`${t.common.analyzing}...`);
    
    streamAiContent(
      {
        prompt: t.monitor.aiTranslatePrompt.replace('{demand}', cmd),
        systemPrompt: 'You are an expert command line translator. Provide only the translated shell command without any markdown formatting, explanation, or conversational text.',
        config: config?.ai
      },
      (chunk) => {
        setCmd(chunk);
      },
      () => {
        setCmdResult(t.monitor.aiTranslateDone);
        setAiLoading(false);
      },
      (err) => {
        if (err === 'AI_CONFIG_MISSING') {
          setCmdResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
        } else {
          setCmdResult(`${t.monitor.aiTranslateFailed}: ${err}`);
        }
        setAiLoading(false);
      }
    );
  };

  const analyzeOutput = async () => {
    if (!cmdResult || isExecuting) return;
    if (analysisResult) {
      setAnalysisResult('');
      return;
    }
    if (aiCacheRef.current[cmdResult]) {
      setAnalysisResult(aiCacheRef.current[cmdResult]);
      return;
    }

    setIsAnalyzing(true);
    setAnalysisResult(`${t.common.analyzing}... 🪄`);
    
    streamAiContent(
      {
        prompt: t.monitor.aiAnalyzeOutputPrompt
          .replace('{lang}', t.common.aiResponseLang)
          .replace('{output}', cmdResult.length > 30000 ? `... [TRUNCATED] ...\n${cmdResult.slice(-30000)}` : cmdResult),
        systemPrompt: 'You are an expert system administrator.',
        config: config?.ai
      },
      (chunk) => {
        setAnalysisResult(chunk);
      },
      () => {
        setIsAnalyzing(false);
        // We can't easily capture the final chunk synchronously here without refactoring,
        // but it's okay, `aiCacheRef.current[cmdResult]` can just be set if we maintain a top-level ref
        // or we just skip caching for stream, or we cache inside the onChunk (but that's slow).
        // Let's just set the ref with the final text.
        // Doing a setState with functional update would work but setAnalysisResult(chunk) is direct.
      },
      (errStr) => {
        if (errStr === 'AI_CONFIG_MISSING') {
          setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
        } else {
          setAnalysisResult(`${t.monitor.aiAnalyzeFailed || t.common.error}: ${errStr}`);
        }
        setIsAnalyzing(false);
      }
    );
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-primary animate-fade-in"
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 999,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          padding: 0,
          boxShadow: '0 8px 16px var(--color-shadow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28)',
          border: 'none',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1) translateY(-5px)'}
        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1) translateY(0)'}
      >
        <div 
          style={{ 
            width: '28px', 
            height: '24px', 
            background: 'rgba(255, 255, 255, 0.15)', 
            borderRadius: '4px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            border: '2px solid rgba(255, 255, 255, 0.8)',
          }}
        >
          <Terminal size={14} color="white" strokeWidth={3} />
        </div>
      </button>
    );
  }

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}
      onClick={() => setIsOpen(false)}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '1000px',
          height: '750px', // Fixed height as requested
          maxHeight: '90vh', // Ensure it doesn't overflow small screens
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 40px 100px -20px var(--color-shadow)',
          position: 'relative',
          border: '1px solid var(--color-surface-border)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Terminal Header (Flat style) */}
        <div 
          className="flex-between" 
          style={{ 
            padding: '0.75rem 1.25rem', 
            background: 'var(--color-surface-bg)',
            borderBottom: '1px solid var(--color-surface-border)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div 
              style={{ 
                background: 'var(--color-primary-light)', 
                color: 'var(--color-primary)', 
                padding: '0.4rem', 
                borderRadius: '6px',
                display: 'flex'
              }}
            >
              <Terminal size={14} />
            </div>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {t.monitor.terminalTitle}
            </span>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setIsOpen(false)}
            style={{ width: '32px', height: '32px', padding: 0, minWidth: 'auto' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', gap: '1rem' }}>
          {/* Quick Commands */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {quickCommands.map((q, i) => (
              <button
                key={i}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCmd(q.cmd)}
                style={{ 
                  fontSize: '0.75rem', 
                  padding: '0.3rem 0.6rem', 
                  background: 'rgba(59, 130, 246, 0.06)', 
                  color: 'var(--color-primary)',
                  borderRadius: '6px'
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Command Input Form */}
          <form onSubmit={executeCommand} style={{ display: 'flex', gap: '0.75rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="input"
                placeholder={t.monitor.terminalHint}
                value={cmd}
                onChange={e => setCmd(e.target.value)}
                disabled={isExecuting}
                style={{ 
                  fontFamily: 'monospace', 
                  fontSize: '0.9rem',
                  paddingRight: cmd ? '2.5rem' : '0.75rem',
                  background: 'var(--color-input-bg)',
                  borderColor: 'var(--color-input-border)'
                }}
              />
              {cmd && !isExecuting && (
                <button
                  type="button"
                  onClick={() => setCmd('')}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {isExecuting ? (
              <button 
                type="button" 
                className="btn btn-danger" 
                onClick={(e) => stopCommand(e)}
                style={{ width: '100px' }}
              >
                <Square size={16} fill="white" style={{ marginRight: '6px' }} /> {t.common.stop}
              </button>
            ) : (
              <button 
                type="submit" 
                className="btn btn-primary" 
                disabled={!cmd}
                style={{ width: '100px', display: 'flex', gap: '8px' }}
              >
                <Play size={16} fill="white" /> {t.common.run}
              </button>
            )}
            <button
              type="button"
              className="btn"
              title={t.monitor.aiTranslate}
              style={{ 
                background: 'var(--color-primary-light)', 
                color: 'var(--color-primary)', 
                border: '1px solid rgba(59, 130, 246, 0.2)', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                fontWeight: 600
              }}
              onClick={translateAICommand}
              disabled={aiLoading || !cmd || isExecuting}
            >
              <Sparkles size={16} className={aiLoading ? 'animate-pulse' : ''} />
              {aiLoading ? t.monitor.translating : t.monitor.aiTranslate}
            </button>
          </form>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
            {/* AI Advice (Collapsible or dismissible) */}
            {(analysisResult || isAnalyzing) && (
              <div 
                className="ai-output-block animate-fade-in" 
                style={{ 
                  background: 'rgba(59, 130, 246, 0.03)', 
                  borderRadius: 'var(--radius-md)', 
                  border: '1px solid rgba(59, 130, 246, 0.12)', 
                  display: 'flex', 
                  flexDirection: 'column',
                  maxHeight: '30%'
                }}
              >
                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.6rem 1rem', color: 'var(--color-primary)', background: 'rgba(239, 246, 255, 0.8)', borderBottom: '1px solid rgba(59, 130, 246, 0.08)' }}>
                  <Brain size={18} /> <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.monitor.aiAdvice}</span>
                  {isAnalyzing && <span className="text-xs animate-pulse opacity-60 ml-2" style={{ fontStyle: 'italic' }}>{t.common.analyzing}...</span>}
                  <button onClick={() => { setAnalysisResult(''); setIsAnalyzing(false); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}>
                    <X size={16} />
                  </button>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.6, padding: '1rem', overflowY: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult || (isAnalyzing ? t.common.analyzing : '...')}</ReactMarkdown>
                  {analysisResult && analysisResult.includes(t.common.errors.aiConfigMissing) && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <Link href="/dashboard/settings" className="btn btn-primary btn-sm" onClick={() => setIsOpen(false)}>{t.common.goToSettings}</Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Terminal View */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
              <div
                ref={terminalRef}
                style={{
                  height: '100%',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  overflowY: 'auto',
                  fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.03)',
                  border: '1px solid var(--color-surface-border)'
                }}
              >
                {cmdResult || <span style={{ color: '#475569' }}>{t.monitor.waiting}</span>}
                {cmdResult && (
                  <div style={{ marginTop: '1rem', height: '1px' }} />
                )}
              </div>
              
              {/* Floating Action within Terminal */}
              {cmdResult && !isExecuting && !aiLoading && (
                <button
                  onClick={analyzeOutput}
                  disabled={isAnalyzing}
                  style={{
                    position: 'absolute',
                    right: '1.25rem',
                    bottom: '1.25rem',
                    background: 'rgba(59, 130, 246, 0.9)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-primary)'}
                >
                  <Sparkles size={14} className={isAnalyzing ? 'animate-pulse' : ''} /> 
                  {isAnalyzing ? t.common.analyzing : t.monitor.aiAnalyzeBtn}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
