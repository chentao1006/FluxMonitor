"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Terminal, X, Square, Sparkles, Brain, Play, Settings, Plus, Trash2, ArrowUp, ArrowDown, Save, RotateCcw } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';
import { translations } from '@/lib/translations';
import { useSettings } from '@/lib/SettingsContext';
import { QuickCommand } from '@/lib/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { streamAiContent } from '@/lib/aiStream';

type QuickCommandKey = keyof typeof translations.zh.monitor.quickCmds;

const defaultQuickCommandSpecs: Array<{ labelKey: QuickCommandKey; cmd: string }> = [
  { labelKey: 'ls', cmd: 'ls -FhG' },
  { labelKey: 'df', cmd: 'df -h' },
  { labelKey: 'memSort', cmd: 'ps -e -o pmem,comm | sort -rn | head -n 10' },
  { labelKey: 'cpuSort', cmd: 'ps -e -o pcpu,comm | sort -rn | head -n 10' },
  { labelKey: 'ip', cmd: 'ifconfig | grep "inet " | grep -v 127.0.0.1' },
  { labelKey: 'ports', cmd: 'lsof -i -P | grep LISTEN' },
  { labelKey: 'portUsage', cmd: 'PORT=3000; lsof -nP -iTCP:$PORT -sTCP:LISTEN' },
  { labelKey: 'uptime', cmd: 'uptime' },
  { labelKey: 'brew', cmd: 'brew list --versions' },
  { labelKey: 'vers', cmd: 'sw_vers' },
  { labelKey: 'procCount', cmd: 'ps aux | wc -l' },
  { labelKey: 'space', cmd: 'du -sh ~/* | sort -rh | head -n 5' },
  { labelKey: 'downloads', cmd: 'ls -lt ~/Downloads | head -n 5' },
  { labelKey: 'arch', cmd: 'uname -m' },
  { labelKey: 'who', cmd: 'who' },
  { labelKey: 'dns', cmd: 'cat /etc/resolv.conf' },
  { labelKey: 'memDetail', cmd: 'vm_stat' },
  { labelKey: 'netStat', cmd: 'netstat -an | grep ESTABLISHED | head -n 10' },
  { labelKey: 'topProc', cmd: 'top -l 1 -s 0 -n 10' },
  { labelKey: 'battery', cmd: 'pmset -g batt' },
  { labelKey: 'cpuInfo', cmd: 'sysctl machdep.cpu.brand_string' },
  { labelKey: 'arp', cmd: 'arp -a | head -n 10' },
];

const defaultLabelByKey = (labelKey: QuickCommandKey) => [
  translations.zh.monitor.quickCmds[labelKey],
  translations.en.monitor.quickCmds[labelKey],
];

const isQuickCommandKey = (key: string): key is QuickCommandKey => {
  return defaultQuickCommandSpecs.some(item => item.labelKey === key);
};

const inferDefaultLabelKey = (command: QuickCommand) => {
  if (command.labelKey && isQuickCommandKey(command.labelKey)) {
    const spec = defaultQuickCommandSpecs.find(item => item.labelKey === command.labelKey);
    if (spec?.cmd === command.cmd.trim() && defaultLabelByKey(command.labelKey).includes(command.label.trim())) {
      return command.labelKey;
    }
  }
  const spec = defaultQuickCommandSpecs.find(item => item.cmd === command.cmd.trim());
  if (!spec) return undefined;
  return defaultLabelByKey(spec.labelKey).includes(command.label.trim()) ? spec.labelKey : undefined;
};

const normalizeQuickCommands = (commands: QuickCommand[]) => {
  return commands
    .map(item => {
      const cmd = item.cmd.trim();
      const labelKey = inferDefaultLabelKey({ ...item, cmd });
      return {
        label: item.label.trim(),
        ...(labelKey ? { labelKey } : {}),
        cmd,
      };
    })
    .filter(item => item.label && item.cmd);
};

export default function GlobalTerminal() {
  const { t } = useLanguage();
  const { config, updateConfig } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [cmd, setCmd] = useState('');
  const [cmdResult, setCmdResult] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [draftQuickCommands, setDraftQuickCommands] = useState<QuickCommand[]>([]);
  const [isManagingQuickCommands, setIsManagingQuickCommands] = useState(false);
  const [isSavingQuickCommands, setIsSavingQuickCommands] = useState(false);
  const [quickCommandError, setQuickCommandError] = useState('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const aiCacheRef = useRef<Record<string, string>>({});

  const getQuickCommandLabel = useCallback((command: QuickCommand) => {
    return command.labelKey && isQuickCommandKey(command.labelKey)
      ? t.monitor.quickCmds[command.labelKey]
      : command.label;
  }, [t]);

  const defaultQuickCommands = useMemo<QuickCommand[]>(() => (
    defaultQuickCommandSpecs.map(item => ({
      label: t.monitor.quickCmds[item.labelKey],
      labelKey: item.labelKey,
      cmd: item.cmd,
    }))
  ), [t]);

  useEffect(() => {
    const hasConfiguredCommands = Array.isArray(config?.terminalQuickCommands);
    const nextCommands = hasConfiguredCommands
      ? normalizeQuickCommands(config.terminalQuickCommands || [])
      : defaultQuickCommands;
    const localizedCommands = nextCommands.map(item => ({
      ...item,
      label: getQuickCommandLabel(item),
    }));
    setQuickCommands(localizedCommands);
    if (!isManagingQuickCommands) {
      setDraftQuickCommands(localizedCommands);
    }
  }, [config?.terminalQuickCommands, defaultQuickCommands, getQuickCommandLabel, isManagingQuickCommands]);

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

  const saveQuickCommands = async (commands: QuickCommand[], closeEditor = false) => {
    const nextCommands = normalizeQuickCommands(commands);
    setIsSavingQuickCommands(true);
    setQuickCommandError('');

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terminalQuickCommands: nextCommands }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t.monitor.quickCommandSaveFailed);
      }
      const nextConfig = config
        ? { ...config, terminalQuickCommands: nextCommands }
        : { users: [], ai: {}, features: {}, terminalQuickCommands: nextCommands };
      updateConfig(nextConfig);
      const localizedCommands = nextCommands.map(item => ({
        ...item,
        label: getQuickCommandLabel(item),
      }));
      setQuickCommands(localizedCommands);
      setDraftQuickCommands(localizedCommands);
      if (closeEditor) {
        setIsManagingQuickCommands(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t.monitor.quickCommandSaveFailed;
      setQuickCommandError(`${t.monitor.quickCommandSaveFailed}: ${message}`);
    } finally {
      setIsSavingQuickCommands(false);
    }
  };

  const updateDraftQuickCommand = (index: number, field: keyof QuickCommand, value: string) => {
    setDraftQuickCommands(prev => prev.map((item, itemIndex) => (
      itemIndex === index
        ? normalizeQuickCommands([{ ...item, [field]: value }])[0] || { ...item, [field]: value }
        : item
    )));
  };

  const moveDraftQuickCommand = (index: number, direction: -1 | 1) => {
    setDraftQuickCommands(prev => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  };

  const addDraftQuickCommand = () => {
    setDraftQuickCommands(prev => [...prev, { label: '', cmd: '' }]);
  };

  const removeDraftQuickCommand = (index: number) => {
    setDraftQuickCommands(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const resetDraftQuickCommands = () => {
    setDraftQuickCommands(defaultQuickCommands);
  };

  const openQuickCommandManager = () => {
    setDraftQuickCommands(quickCommands);
    setQuickCommandError('');
    setIsManagingQuickCommands(true);
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
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    streamAiContent(
      {
        prompt: t.monitor.aiTranslatePrompt.replace('{demand}', cmd),
        systemPrompt: 'You are an expert command line translator. Provide only the translated shell command without any markdown formatting, explanation, or conversational text.',
        config: config?.ai,
        signal: controller.signal
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
    if (!cmdResult) return;
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
    
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    streamAiContent(
      {
        prompt: t.monitor.aiAnalyzeOutputPrompt
          .replace('{lang}', t.common.aiResponseLang)
          .replace('{output}', cmdResult.length > 30000 ? `... [TRUNCATED] ...\n${cmdResult.slice(-30000)}` : cmdResult),
        systemPrompt: 'You are an expert system administrator.',
        config: config?.ai,
        signal: controller.signal
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {quickCommands.map((q, i) => (
                <button
                  key={`${q.label}-${q.cmd}-${i}`}
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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={openQuickCommandManager}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  border: '1px solid var(--color-surface-border)',
                  borderRadius: '6px',
                  display: 'flex',
                  gap: '0.35rem',
                }}
              >
                <Settings size={13} /> {t.monitor.quickCommandManage}
              </button>
            </div>

            {isManagingQuickCommands && (
              <div
                style={{
                  border: '1px solid var(--color-surface-border)',
                  background: 'var(--color-surface-bg)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                  maxHeight: '260px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    flex: '0 0 auto',
                    paddingBottom: '0.6rem',
                    borderBottom: '1px solid var(--color-surface-border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={addDraftQuickCommand}>
                      <Plus size={14} style={{ marginRight: 4 }} /> {t.monitor.quickCommandAdd}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={resetDraftQuickCommands}>
                      <RotateCcw size={14} style={{ marginRight: 4 }} /> {t.monitor.quickCommandReset}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setDraftQuickCommands(quickCommands);
                        setIsManagingQuickCommands(false);
                      }}
                      disabled={isSavingQuickCommands}
                    >
                      {t.common.cancel}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => saveQuickCommands(draftQuickCommands, true)}
                      disabled={isSavingQuickCommands}
                    >
                      <Save size={14} style={{ marginRight: 4 }} /> {isSavingQuickCommands ? t.common.saving : t.monitor.quickCommandDone}
                    </button>
                  </div>
                </div>
                {quickCommandError && (
                  <div style={{ color: 'var(--color-danger)', fontSize: '0.8rem', flex: '0 0 auto' }}>{quickCommandError}</div>
                )}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    overflowY: 'auto',
                    minHeight: 0,
                    paddingRight: '0.15rem',
                  }}
                >
                  {draftQuickCommands.map((item, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(90px, 0.7fr) minmax(180px, 1.8fr) auto',
                        gap: '0.5rem',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        type="text"
                        className="input"
                        value={item.label}
                        onChange={(e) => updateDraftQuickCommand(index, 'label', e.target.value)}
                        placeholder={t.monitor.quickCommandLabel}
                        style={{ height: '34px', fontSize: '0.8rem' }}
                      />
                      <input
                        type="text"
                        className="input"
                        value={item.cmd}
                        onChange={(e) => updateDraftQuickCommand(index, 'cmd', e.target.value)}
                        placeholder={t.monitor.quickCommandCommand}
                        style={{ height: '34px', fontSize: '0.8rem', fontFamily: 'monospace' }}
                      />
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveDraftQuickCommand(index, -1)} disabled={index === 0} style={{ padding: '0.25rem' }} title="Move up">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => moveDraftQuickCommand(index, 1)} disabled={index === draftQuickCommands.length - 1} style={{ padding: '0.25rem' }} title="Move down">
                          <ArrowDown size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDraftQuickCommand(index)} style={{ padding: '0.25rem', color: 'var(--color-danger)' }} title={t.common.delete}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Command Input Form */}
          <form className="terminal-command-form" onSubmit={executeCommand}>
            <div className="terminal-command-input">
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
            <button
              type="button"
              className="btn terminal-command-action"
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
            {isExecuting ? (
              <button 
                type="button" 
                className="btn btn-danger terminal-command-run"
                onClick={(e) => stopCommand(e)}
                style={{ width: '100px' }}
              >
                <Square size={16} fill="white" style={{ marginRight: '6px' }} /> {t.common.stop}
              </button>
            ) : (
              <button 
                type="submit" 
                className="btn btn-primary terminal-command-run"
                disabled={!cmd}
                style={{ width: '100px', display: 'flex', gap: '8px' }}
              >
                <Play size={16} fill="white" /> {t.common.run}
              </button>
            )}
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
                  <button onClick={() => {
                    abortControllerRef.current?.abort();
                    setAnalysisResult('');
                    setIsAnalyzing(false);
                  }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-primary)' }}>
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
              {cmdResult && !aiLoading && (
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
