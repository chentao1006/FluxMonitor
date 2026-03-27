
"use client";
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSettings } from '@/lib/SettingsContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Camera, X, Download, Activity, Layers, Sparkles, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';


export default function DashboardOverview() {
    // AI Analysis states
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
    const [aiAnalyzing, setAiAnalyzing] = useState(false);
    const aiCacheRef = useRef<{ [k: string]: string }>({});

    // 组装系统健康分析 prompt
    const buildSystemHealthPrompt = () => {
      const lines = [];
      lines.push(`# System Health Overview`);
      if (stats) {
        lines.push(`- Hostname: ${stats.hostname}`);
        lines.push(`- Uptime: ${stats.uptime}`);
        lines.push(`- LoadAvg: ${stats.loadAvg}`);
        lines.push(`- CPU: user ${stats.cpu?.user ?? 'N/A'}%, sys ${stats.cpu?.sys ?? 'N/A'}%`);
        lines.push(`- Memory: ${stats.memory?.usedMB ?? 'N/A'}MB / ${stats.memory?.totalMB ?? 'N/A'}MB`);
        lines.push(`- Swap: ${stats.swap ?? 'N/A'}`);
        lines.push(`- Disk: ${stats.disk?.used ?? 'N/A'} / ${stats.disk?.total ?? 'N/A'}`);
        lines.push(`- Network: ${stats.network ?? 'N/A'}`);
        lines.push(`- MemPressure: ${stats.memPressure ?? 'N/A'}`);
        lines.push(`- Battery: ${stats.battery ?? 'N/A'}`);
        lines.push(`- OS: ${stats.osVersion ?? 'N/A'}, Kernel: ${stats.kernel ?? 'N/A'}, Arch: ${stats.arch ?? 'N/A'}`);
        lines.push(`- CPU Model: ${stats.cpuModel ?? 'N/A'}`);
      }
      lines.push(`- Docker: running ${dockerSummary.running} / total ${dockerSummary.total}`);
      lines.push(`- Nginx: active ${nginxSummary.active} / total ${nginxSummary.total}`);
      lines.push(`- Processes: total ${procSummary.total}, top: ${procSummary.topName} (${procSummary.topCpu})`);
      lines.push(`- LaunchAgents: loaded ${agentSummary.loaded} / total ${agentSummary.total}`);
      lines.push(`- Logs: total ${logSummary.total}, last: ${logSummary.lastFile}`);
      lines.push(`- Configs: total ${configSummary.total}, sys: ${configSummary.sysCount}, user: ${configSummary.userCount}`);
      return lines.join('\n');
    };

    const handleAiAnalyze = async () => {
      if (aiAnalyzing) return;
      const statsText = buildSystemHealthPrompt();
      const cacheKey = `overview:${statsText}`;
      if (aiCacheRef.current[cacheKey]) {
        setAiAnalysis(aiCacheRef.current[cacheKey]);
        return;
      }
      setAiAnalyzing(true);
      setAiAnalysis(null);
      try {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: t.monitor.aiHealthPrompt
              .replace('{lang}', t.common.aiResponseLang)
              .replace('{stats}', statsText),
            systemPrompt: 'You are a senior macOS/Linux system expert specializing in health diagnostics, performance analysis, and risk assessment. Provide professional, concise, and practical advice.'
          }),
        });
        const data = await res.json();
        if (data.success) {
          setAiAnalysis(data.data);
          aiCacheRef.current[cacheKey] = data.data;
        } else if (data.error === 'AI_CONFIG_MISSING') {
          setAiAnalysis(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
        } else {
          setAiAnalysis(`${t.common.error}: ${data.error}`);
        }
      } catch {
        setAiAnalysis(t.common.networkError);
      } finally {
        setAiAnalyzing(false);
      }
    };
  const { t } = useLanguage();
  const { config: settingsConfig } = useSettings();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [history, setHistory] = useState<any[]>(() => {
    const now = new Date();
    return Array.from({ length: 24 }, (_, i) => {
      const d = new Date(now.getTime() - (23 - i) * 5000);
      return {
        time: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`,
        cpu: null,
        memory: null,
        netIn: null,
        netOut: null
      };
    });
  });
  const [, setPrevNetBytes] = useState<{ in: number, out: number } | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(false);

  // Summary stats states
  const [dockerSummary, setDockerSummary] = useState({ running: 0, total: 0 });
  const [nginxSummary, setNginxSummary] = useState({ active: 0, total: 0 });
  const [procSummary, setProcSummary] = useState({ total: 0, topName: '', topCpu: '' });
  const [agentSummary, setAgentSummary] = useState({ loaded: 0, total: 0 });
  const [logSummary, setLogSummary] = useState({ total: 0, lastFile: '', lastTime: '' });
  const [configSummary, setConfigSummary] = useState({ total: 0, sysCount: 0, userCount: 0 });
  
  const features = settingsConfig?.features || {};

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
    } catch {
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
            // We use 5s interval now, so divide by 5
            netInSpeed = Math.max(0, (currentNetBytes.in - currentPrevNet.in) / 1024 / 5);
            netOutSpeed = Math.max(0, (currentNetBytes.out - currentPrevNet.out) / 1024 / 5);
          }

          setHistory(prev => {
            const newPoint = {
              time: timeStr,
              cpu: Number(cpuUsage.toFixed(1)),
              memory: Number(memPercent.toFixed(1)),
              netIn: Number(netInSpeed.toFixed(1)),
              netOut: Number(netOutSpeed.toFixed(1))
            };
            const newHistory = [...prev, newPoint];
            if (newHistory.length > 24) newHistory.shift();
            return newHistory;
          });
          return dataStats.data.netBytes || currentPrevNet;
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSummaries = async () => {
    const activeFeatures = settingsConfig?.features || {};
    try {
      const tasks: Promise<void>[] = [];

      // Docker
      if (activeFeatures.docker !== false) {
        tasks.push(fetch('/api/docker/containers').then(res => res.json()).then(data => {
          if (data.success) {
            setDockerSummary({
              running: (data.data as { State: string }[]).filter((c) => c.State === 'running').length,
              total: data.data.length
            });
          }
        }));
      }

      // Nginx
      if (activeFeatures.nginx !== false) {
        tasks.push(fetch('/api/nginx/sites').then(res => res.json()).then(data => {
          if (data.success) {
            setNginxSummary({
              active: (data.data as { status: string }[]).filter((s) => s.status === 'enabled').length,
              total: data.data.length
            });
          }
        }));
      }

      // Processes
      if (activeFeatures.processes !== false) {
        tasks.push(fetch('/api/system/processes?sort=cpu').then(res => res.json()).then(data => {
          if (data.success && data.data.length > 0) {
            const top = data.data[0];
            setProcSummary({ 
              total: data.data.length,
              topName: top.command,
              topCpu: `${top.cpu}%`
            });
          }
        }));
      }

      // LaunchAgents
      if (activeFeatures.launchagent !== false) {
        tasks.push(fetch('/api/launchagent/list').then(res => res.json()).then(data => {
          if (data.success) {
            setAgentSummary({
              loaded: (data.data as { isLoaded: boolean }[]).filter((a) => a.isLoaded).length,
              total: data.data.length
            });
          }
        }));
      }

      // Logs
      if (activeFeatures.logs !== false) {
        tasks.push(fetch('/api/logs').then(res => res.json()).then(data => {
          if (data.success && data.data.length > 0) {
            const sorted = [...data.data].sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
            const last = sorted[0];
            setLogSummary({ 
              total: data.data.length,
              lastFile: last.name,
              lastTime: last.mtime
            });
          }
        }));
      }

      // Configs
      if (activeFeatures.configs !== false) {
        tasks.push(fetch('/api/configs').then(res => res.json()).then(data => {
          if (data.success && data.data.length > 0) {
            const sysCount = (data.data as { type: string }[]).filter(c => c.type === 'system').length;
            const userCount = data.data.length - sysCount;
            setConfigSummary({ 
              total: data.data.length,
              sysCount,
              userCount
            });
          }
        }));
      }

      await Promise.allSettled(tasks);
    } catch (e) {
      console.error('Fetch summaries failed', e);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchAllSummaries();
    
    // Stats (CPU/Mem/Net) are more dynamic - refresh every 5s
    const statsInterval = setInterval(fetchStats, 5000);
    
    // Summaries change less often - refresh every 30s
    const summaryInterval = setInterval(fetchAllSummaries, 30000);
    
    return () => {
      clearInterval(statsInterval);
      clearInterval(summaryInterval);
    };
  }, [settingsConfig?.features]);

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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'nowrap' }}>
          <button
            className="btn"
            onClick={handleAiAnalyze}
            disabled={aiAnalyzing || loading}
            style={{
              gap: '0.75rem',
              padding: '0.6rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              background: 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%)',
              color: '#fff',
              border: 'none',
              boxShadow: '0 2px 8px 0 rgba(139,92,246,0.10)'
            }}
          >
            <Sparkles size={20} className={aiAnalyzing ? 'animate-pulse' : ''} />
            <span style={{ fontWeight: 600 }}>{aiAnalyzing ? t.common.analyzing : t.common.analyze || ''}</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={takeScreenshot}
            disabled={screenshotLoading}
            style={{ gap: '0.75rem', padding: '0.6rem 1.25rem' }}
          >
            <Camera size={20} className={screenshotLoading ? 'animate-pulse' : ''} />
            {screenshotLoading ? t.monitor.executing : t.monitor.screenshotBtn}
          </button>
        </div>
      </div>
      {/* AI 分析结果卡片 */}
      {(aiAnalysis || aiAnalyzing) && (
        <div className="card glass-panel" style={{ marginBottom: '1.2rem', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 20px var(--color-shadow)', padding: '1.25rem', maxWidth: 900, marginLeft: 'auto', marginRight: 'auto' }}>
          <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
            <div className="flex-center" style={{ gap: '0.5rem', color: 'var(--color-primary)' }}>
              <Sparkles size={18} />
              <span style={{ fontWeight: 600 }}>{t.monitor.aiAnalysisTitle || ''}</span>
            </div>
            {aiAnalyzing && <RefreshCw size={16} className="animate-spin" color="var(--color-primary)" />}
            <button style={{ marginLeft: '1rem', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setAiAnalysis(null)}><X size={16} /></button>
          </div>
          {aiAnalyzing ? (
            <div className="flex-center" style={{ padding: '1.5rem', flexDirection: 'column', gap: '0.5rem' }}>
              <RefreshCw size={24} className="animate-spin" color="var(--color-primary)" style={{ opacity: 0.5 }} />
              <p style={{ fontSize: '0.9rem', fontStyle: 'italic', margin: 0, color: 'var(--color-text-muted)' }}>{t.common.analyzing || ''}</p>
            </div>
          ) : (
            <div className="ai-output-block no-scrollbar markdown-body" style={{ fontSize: '0.95rem', color: 'var(--color-text)', lineHeight: 1.7, maxHeight: '400px', overflowY: 'auto' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis || ''}</ReactMarkdown>
              {aiAnalysis?.includes(t.common.errors?.aiConfigMissing) && (
                <div style={{ marginTop: '0.75rem' }}>
                  <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showScreenshot && screenshot && (
        <div
          className="screenshot-modal-overlay"
          onClick={() => setShowScreenshot(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex',
            alignItems: 'flex-start', justifyContent: 'center', padding: '4rem 1rem 1rem 1rem',
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
                <Camera size={18} color="var(--color-primary)" />
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
              background: 'var(--color-bg)', display: 'flex', justifyContent: 'center', flex: 1
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-surface-border)" />
                <XAxis dataKey="time" hide />
                <YAxis domain={[0, 100]} stroke="var(--color-text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface-bg)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid var(--color-surface-border)' }}
                  itemStyle={{ color: 'var(--color-text)' }}
                  labelStyle={{ color: 'var(--color-text)' }}
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-surface-border)" />
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
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-surface-border)" />
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
              <StatRow label={t.monitor.network} value={stats?.network?.split(',')[0]?.replace('in', '↓')} />
              <StatRow label={t.monitor.battery} value={stats?.battery} color="#10b981" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards Row */}
      <div className="responsive-grid responsive-grid-3" style={{ marginBottom: '1.5rem' }}>
        {features?.processes !== false && (
          <Link href="/dashboard/processes" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <div className="stat-card-icon">
                  <Layers size={20} />
                </div>
                <div className="stat-card-label">{t.sidebar.processes}</div>
              </div>
              <div className="stat-card-value-container">
                <div className="stat-card-value" style={{ fontSize: procSummary.topName ? '1.4rem' : '1.85rem' }}>
                  {procSummary.topName || procSummary.total}
                </div>
                <div className="stat-card-unit" style={{ color: 'var(--color-primary)' }}>
                  {procSummary.topCpu}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '-8px' }}>
                {procSummary.total} {t.monitor.processes}
              </div>
            </div>
          </Link>
        )}

        {features?.logs !== false && (
          <Link href="/dashboard/logs" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <div className="stat-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                </div>
                <div className="stat-card-label">{t.sidebar.logs}</div>
              </div>
              <div className="stat-card-value-container">
                <div className="stat-card-value" style={{ fontSize: '1.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {logSummary.lastFile || t.common.none}
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '-8px' }}>
                {logSummary.total} {t.sidebar.logs}
              </div>
            </div>
          </Link>
        )}

        {features?.configs !== false && (
          <Link href="/dashboard/configs" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <div className="stat-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                  </svg>
                </div>
                <div className="stat-card-label">{t.sidebar.configs}</div>
              </div>
              <div className="stat-card-value-container">
                <div className="stat-card-value" style={{ fontSize: '1.6rem' }}>
                  {configSummary.sysCount} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>Sys</span>
                  <span style={{ margin: '0 8px', color: 'var(--color-surface-border)' }}>|</span>
                  {configSummary.userCount} <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>User</span>
                </div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '-8px' }}>
                {configSummary.total} {t.sidebar.configs}
              </div>
            </div>
          </Link>
        )}

        {features?.launchagent !== false && (
          <Link href="/dashboard/launchagent" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <div className="stat-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-5a2 2 0 0 1 3-1" /><path d="M12 15v5s3.03-.55 5-2a2 2 0 0 0 1-3" />
                  </svg>
                </div>
                <div className="stat-card-label">{t.sidebar.launchagent}</div>
              </div>
              <div className="stat-card-value-container">
                <div className="stat-card-value">
                  {agentSummary.loaded} <span className="stat-card-value-total">/ {agentSummary.total}</span>
                </div>
                <div className="stat-card-unit">{t.launchagent.totalAgents}</div>
              </div>
            </div>
          </Link>
        )}

        {features?.docker !== false && (
          <Link href="/dashboard/docker" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <div className="stat-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                  </svg>
                </div>
                <div className="stat-card-label">{t.sidebar.docker}</div>
              </div>
              <div className="stat-card-value-container">
                <div className="stat-card-value">
                  {dockerSummary.running} <span className="stat-card-value-total">/ {dockerSummary.total}</span>
                </div>
                <div className="stat-card-unit">{t.docker.running}</div>
              </div>
            </div>
          </Link>
        )}

        {features?.nginx !== false && (
          <Link href="/dashboard/nginx" style={{ textDecoration: 'none', display: 'block' }}>
            <div className="stat-card glass-panel">
              <div className="stat-card-header">
                <div className="stat-card-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line>
                  </svg>
                </div>
                <div className="stat-card-label">{t.sidebar.nginx}</div>
              </div>
              <div className="stat-card-value-container">
                <div className="stat-card-value">
                  {nginxSummary.active} <span className="stat-card-value-total">/ {nginxSummary.total}</span>
                </div>
                <div className="stat-card-unit">{t.nginx.activeSites}</div>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div className="flex-between" style={{ padding: '0.2rem 0' }}>
      <span style={{ fontSize: small ? '0.7rem' : '0.8rem', color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: small ? '0.7rem' : '0.85rem', fontWeight: 600, color: color || 'var(--color-text)' }}>{value || 'N/A'}</span>
    </div>
  );
}
