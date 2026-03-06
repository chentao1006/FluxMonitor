"use client";

import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, X, Maximize2, Download, Activity, Sparkles, Brain, Square } from 'lucide-react';

export default function DashboardOverview() {
  const { t } = useLanguage();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null);
  const [cmd, setCmd] = useState('');
  const [cmdResult, setCmdResult] = useState('');
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>([]);
  const [prevNetBytes, setPrevNetBytes] = useState<{ in: number, out: number } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const [isExecuting, setIsExecuting] = useState(false);
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
  ];

  const takeScreenshot = async () => {
    setScreenshotLoading(true);
    try {
      const res = await fetch('/api/system/screenshot', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setScreenshot(data.data);
        setShowScreenshot(true);
      } else {
        alert(`${t.monitor.screenshotFail}: ${data.error || data.details}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      setScreenshotLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const resStats = await fetch('/api/system/stats');
      const dataStats = await resStats.json();
      if (dataStats.success) {
        setStats(dataStats.data);

        setPrevNetBytes(currentPrevNet => {
          setHistory(prev => {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

            let cpuUsage = 0;
            if (dataStats.data.cpu) {
              cpuUsage = dataStats.data.cpu.user + dataStats.data.cpu.sys;
            }

            const memUsed = dataStats.data.memory?.usedMB || 0;
            const memTotal = dataStats.data.memory?.totalMB || 0;
            const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

            let netInSpeed = 0;
            let netOutSpeed = 0;

            const currentNetBytes = dataStats.data.netBytes;
            if (currentPrevNet && currentNetBytes && currentNetBytes.in > 0 && currentNetBytes.out > 0) {
              netInSpeed = Math.max(0, (currentNetBytes.in - currentPrevNet.in) / 1024 / 5);
              netOutSpeed = Math.max(0, (currentNetBytes.out - currentPrevNet.out) / 1024 / 5);
            }

            const newPoint = {
              time: timeStr,
              cpu: Number(cpuUsage.toFixed(1)),
              memory: Number(memPercent.toFixed(1)),
              netIn: Number(netInSpeed.toFixed(1)),
              netOut: Number(netOutSpeed.toFixed(1))
            };
            const newHistory = [...prev, newPoint];
            if (newHistory.length > 30) newHistory.shift();
            return newHistory;
          });
          return dataStats.data.netBytes || currentPrevNet;
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [cmdResult]);

  const stopCommand = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsExecuting(false);
    }
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
      } catch (err: any) {
        if (err.name === 'AbortError') {
          setCmdResult(prev => prev + '\n[Stopped: Interrupted]\n');
        } else {
          throw err;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
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
    setCmdResult('AI is translating your requirement to command... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Translate the following natural language requirement to a single-line bash command for macOS. Requirement: ${cmd}\nNote: Return ONLY the command itself without markdown or extra explanation.`
        })
      });
      const data = await res.json();
      if (data.success) {
        setCmd(data.data);
        setCmdResult('✅ AI Translation complete! Please check and execute.');
      } else {
        setCmdResult(`AI Translation failed: ${data.error || data.details}`);
      }
    } catch {
      setCmdResult(t.common.networkError);
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    setAnalysisResult('');
  }, [cmdResult]);

  const analyzeOutput = async () => {
    if (!cmdResult || cmdResult === 'Executing...' || cmdResult.includes('AI is translating')) return;

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
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `As a system expert, analyze the following terminal output. Explain what it means, identify key info/anomalies, and suggest actions. Output in Markdown, language should match user's context.\n\n${cmdResult.slice(-4000)}`,
          systemPrompt: 'You are an expert system administrator.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cmdResult] = data.data;
      } else {
        setAnalysisResult(`Analysis failed: ${data.error}`);
      }
    } catch (e) {
      setAnalysisResult(t.common.networkError);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (loading && !stats) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid animate-fade-in dashboard-page" style={{ gap: '1rem' }}>
      <div className="flex-between page-header" style={{ marginBottom: '0.5rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Activity size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0' }}>{t.monitor.title}</h1>
        </div>
        <button
          className="btn btn-primary mobile-full-width"
          onClick={takeScreenshot}
          disabled={screenshotLoading}
          style={{ gap: '0.75rem', padding: '0.6rem 1.25rem' }}
        >
          <Camera size={20} className={screenshotLoading ? 'animate-pulse' : ''} />
          {screenshotLoading ? t.monitor.executing : t.monitor.screenshotBtn}
        </button>
      </div>

      {showScreenshot && screenshot && (
        <div
          className="screenshot-modal-overlay"
          onClick={() => setShowScreenshot(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: '1rem',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <div
            className="screenshot-card glass-panel"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative', width: '100%', maxWidth: '1200px',
              maxHeight: '90vh', background: 'var(--color-bg)', padding: '1rem',
              borderRadius: 'var(--radius-lg)', display: 'flex',
              flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Maximize2 size={18} color="var(--color-primary)" />
                <span style={{ fontWeight: 600 }}>{t.monitor.screenshot}</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={screenshot}
                  download={`screenshot_${new Date().getTime()}.png`}
                  className="btn btn-ghost"
                  style={{ padding: '0.4rem' }}
                >
                  <Download size={20} />
                </a>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowScreenshot(false)}
                  style={{ padding: '0.4rem' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div style={{
              overflow: 'auto', borderRadius: 'var(--radius-md)',
              background: '#f1f5f9', display: 'flex', justifyContent: 'center', flex: 1
            }}>
              <img
                src={screenshot}
                alt="System Screenshot"
                style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain', borderRadius: 'var(--radius-sm)' }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="responsive-grid responsive-grid-2">
        <div className="card glass-panel chart-card" style={{ padding: '1rem', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t.monitor.cpuChart}</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {history.length > 0 ? `${history[history.length - 1].cpu}%` : 'N/A'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
              User: {stats?.cpu?.user || 0}% | Sys: {stats?.cpu?.sys || 0}%
            </div>
          </div>
          <div style={{ width: '100%', height: '120px', marginTop: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid var(--color-surface-border)' }}
                />
                <Area type="monotone" dataKey="cpu" name="CPU (%)" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass-panel chart-card" style={{ padding: '1rem', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t.monitor.memChart}</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
              {history.length > 0 ? `${history[history.length - 1].memory}%` : 'N/A'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
              {t.monitor.used} {stats?.memory?.usedMB || '0'} MB / {t.monitor.total} {stats?.memory?.totalMB || '0'} MB
            </div>
          </div>
          <div style={{ width: '100%', height: '120px', marginTop: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorMem" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid var(--color-surface-border)' }}
                />
                <Area type="monotone" dataKey="memory" name="Memory (%)" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="responsive-grid responsive-grid-2">
        <div className="card glass-panel chart-card" style={{ padding: '1rem', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>{t.monitor.networkChart}</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#10b981' }}>↓ {history.length > 0 ? history[history.length - 1].netIn : '0'}</span>
              <span style={{ color: '#8b5cf6' }}>↑ {history.length > 0 ? history[history.length - 1].netOut : '0'}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
              {stats?.network?.split(',').slice(0, 2).join(',') || 'N/A'} ({t.monitor.accumulated})
            </div>
          </div>
          <div style={{ width: '100%', height: '120px', marginTop: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorNetIn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorNetOut" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.9)' }} />
                <Area type="monotone" dataKey="netIn" name={t.monitor.down} stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorNetIn)" isAnimationActive={false} />
                <Area type="monotone" dataKey="netOut" name={t.monitor.up} stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorNetOut)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '1.25rem', minHeight: '200px' }}>
          <div className="info-grid-container" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <StatRow label={t.monitor.hostname} value={stats?.hostname} />
              <StatRow label={t.monitor.loadAvg} value={stats?.loadAvg} color="var(--color-primary)" />
              <StatRow label={t.monitor.uptime} value={stats?.uptime?.split(',')[0]?.split('up')[1]?.trim()} />
              <StatRow label={t.monitor.diskSpace} value={`${stats?.disk?.used} / ${stats?.disk?.total}`} />
              <StatRow label={t.monitor.kernel} value={stats?.kernel} />
              <StatRow label={t.monitor.cpuModel} value={stats?.cpuModel} small />
            </div>
            <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <StatRow label={t.monitor.swap} value={stats?.swap} />
              <StatRow label={t.monitor.arch} value={stats?.arch} />
              <StatRow label={t.monitor.memPressure} value={stats?.memPressure} />
              <StatRow label={t.monitor.osVersion} value={stats?.osVersion} />
              <StatRow label={t.monitor.network + ' ' + t.monitor.accumulated} value={stats?.network?.split(',')[0]?.replace('in', '↓')} />
              <StatRow label={t.monitor.battery} value={stats?.battery} color="#10b981" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card glass-panel terminal-section" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', minHeight: '550px', maxWidth: '100%', overflow: 'hidden' }}>
          <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
            <h2 className="card-title" style={{ margin: 0 }}>{t.monitor.terminalTitle}</h2>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {quickCommands.map((q, i) => (
              <button key={i} type="button" className="btn btn-ghost btn-sm" onClick={() => setCmd(q.cmd)} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: 'rgba(59, 130, 246, 0.05)', color: 'var(--color-primary)' }}>
                {q.label}
              </button>
            ))}
          </div>
          <form onSubmit={executeCommand} className="command-form" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input type="text" className="input terminal-input" placeholder={t.monitor.terminalHint} value={cmd} onChange={e => setCmd(e.target.value)} disabled={isExecuting} style={{ flex: 1, fontFamily: 'monospace' }} />
            {isExecuting ? (
              <button type="button" className="btn btn-danger" onClick={stopCommand} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Square size={16} fill="white" /> {t.common.stop}
              </button>
            ) : (
              <button type="submit" className="btn btn-primary">{t.common.run}</button>
            )}
            <button type="button" className="btn" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid rgba(59, 130, 246, 0.2)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }} onClick={translateAICommand} disabled={aiLoading || !cmd || isExecuting}>
              <Sparkles size={16} className={aiLoading ? 'animate-pulse' : ''} />
              {aiLoading ? t.monitor.translating : t.monitor.aiTranslate}
            </button>
            {cmdResult && !isExecuting && !aiLoading && (
              <button
                type="button"
                className="btn"
                onClick={analyzeOutput}
                disabled={isAnalyzing}
                style={{
                  background: 'white',
                  border: '1px solid var(--color-primary)',
                  color: 'var(--color-primary)',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s'
                }}
              >
                <Sparkles size={14} className={isAnalyzing ? 'animate-pulse' : ''} />
                {isAnalyzing ? t.common.analyzing : t.monitor.aiAnalyzeBtn}
              </button>
            )}
          </form>
          {analysisResult && (
            <div className="ai-output-block" style={{ marginBottom: '1.25rem', background: 'rgba(59, 130, 246, 0.03)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.1)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1.25rem', color: 'var(--color-primary)', background: 'rgba(240, 247, 255, 0.95)', backdropFilter: 'blur(8px)', zIndex: 5, borderBottom: '1px solid rgba(59, 130, 246, 0.05)' }}>
                <Brain size={18} /> <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.monitor.aiAdvice}</span>
                <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7, padding: '1.25rem', maxHeight: '350px', overflowY: 'auto' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
              </div>
            </div>
          )}
          <div ref={terminalRef} className="terminal-output" style={{ flex: 1, background: '#ffffff', color: '#1e293b', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-surface-border)', padding: '1.25rem', overflowY: 'auto', fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: '0.85rem', minHeight: '400px', position: 'relative' }}>
            {cmdResult || <span style={{ color: '#94a3b8' }}>{t.monitor.waiting}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, color, small }: { label: string, value: any, color?: string, small?: boolean }) {
  return (
    <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
      <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>{label}</h3>
      <div style={{ fontSize: small ? '0.7rem' : '0.85rem', fontWeight: 600, color: color || 'inherit', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
        {value || 'N/A'}
      </div>
    </div>
  );
}
