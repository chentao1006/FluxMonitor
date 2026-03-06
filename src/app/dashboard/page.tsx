"use client";

import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { XSquare, Camera, X, Maximize2, Download, Activity, Sparkles, Brain, Square } from 'lucide-react';

export default function DashboardOverview() {
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

  const quickCommands = [
    { label: '目录', cmd: 'ls -FhG' },
    { label: '磁盘', cmd: 'df -h' },
    { label: '内存排行', cmd: 'ps -e -o pmem,comm | sort -rn | head -n 10' },
    { label: 'CPU 排行', cmd: 'ps -e -o pcpu,comm | sort -rn | head -n 10' },
    { label: '本机 IP', cmd: 'ifconfig | grep "inet " | grep -v 127.0.0.1' },
    { label: '监听端口', cmd: 'lsof -i -P | grep LISTEN' },
    { label: '运行时间', cmd: 'uptime' },
    { label: 'Brew', cmd: 'brew list --versions' },
    { label: '系统版本', cmd: 'sw_vers' },
    { label: '进程数', cmd: 'ps aux | wc -l' },
    { label: '空间详情', cmd: 'du -sh ~/* | sort -rh | head -n 5' },
    { label: '下载历史', cmd: 'ls -lt ~/Downloads | head -n 5' },
    { label: '硬件架构', cmd: 'uname -m' },
    { label: '活跃用户', cmd: 'who' },
    { label: 'DNS 配置', cmd: 'cat /etc/resolv.conf' },
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
        alert(`截图失败: ${data.error || data.details}`);
      }
    } catch (e) {
      alert('网络请求失败');
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
            // Robust calculation: only compute if we have a realistic total memory
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
            if (newHistory.length > 30) newHistory.shift(); // Keep last 30 points
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
          setCmdResult(prev => prev + '\n[已停止: 用户中断执行]\n');
        } else {
          throw err;
        }
      } finally {
        reader.releaseLock();
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setCmdResult(prev => prev + `\n[Error]: 网络请求失败 (${e.message})`);
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const translateAICommand = async () => {
    if (!cmd) return;
    setAiLoading(true);
    setCmdResult('AI 正在把你的自然语言翻译成执行命令... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请将以下的自然语言需求翻译成可以在 macOS 终端执行的单行 bash 命令。需求：${cmd}\n注意：你只需且必须直接返回一行可以直接运行的纯 bash 命令行代码，不要包含任何 markdown 语法（如 \`\`\`bash）和多余对话文字。`
        })
      });
      const data = await res.json();
      if (data.success) {
        setCmd(data.data);
        setCmdResult('✅ AI 翻译完成！请检查命令是否正确，然后点击「执行」。');
      } else {
        setCmdResult(`AI 翻译失败: ${data.error || data.details}`);
      }
    } catch {
      setCmdResult('网络错误');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (cmdResult && !cmdResult.includes('翻译') && !cmdResult.includes('执行中')) {
      setAnalysisResult('');
    }
  }, [cmdResult]);

  const analyzeOutput = async () => {
    if (!cmdResult || cmdResult === '执行中...' || cmdResult.includes('正在把你的自然语言翻译成')) return;
    setIsAnalyzing(true);
    setAnalysisResult('AI 正在深度分析命令输出内容... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请作为资深系统专家，分析以下终端命令的运行输出。请解释该输出代表了什么、是否有关键信息或异常、以及建议的操作。要求使用中文，Markdown 格式，结构清晰。命令输出如下：\n\n${cmdResult.slice(-4000)}`,
          systemPrompt: 'You are an expert system administrator and software engineer specializing in system diagnostics and performance analysis.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
      } else {
        setAnalysisResult(`分析失败: ${data.error}`);
      }
    } catch (e) {
      setAnalysisResult('网络请求失败');
    } finally {
      setIsAnalyzing(false);
    }
  };


  if (loading && !stats) return <div className="flex-center" style={{ height: '70vh' }}>加载中...</div>;

  return (
    <div className="grid animate-fade-in dashboard-page" style={{ gap: '1rem' }}>
      <div className="flex-between page-header" style={{ marginBottom: '0.5rem', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Activity size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0' }}>系统监控</h1>
        </div>
        <button
          className="btn btn-primary mobile-full-width"
          onClick={takeScreenshot}
          disabled={screenshotLoading}
          style={{ gap: '0.75rem', padding: '0.6rem 1.25rem' }}
        >
          <Camera size={20} className={screenshotLoading ? 'animate-pulse' : ''} />
          {screenshotLoading ? '正在截图...' : '屏幕截图'}
        </button>
      </div>

      {/* Screenshot Modal Overlay */}
      {showScreenshot && screenshot && (
        <div
          className="screenshot-modal-overlay"
          onClick={() => setShowScreenshot(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <div
            className="screenshot-card glass-panel"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '1200px',
              maxHeight: '90vh',
              background: 'var(--color-bg)',
              padding: '1rem',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Maximize2 size={18} color="var(--color-primary)" />
                <span style={{ fontWeight: 600 }}>系统实时截图</span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <a
                  href={screenshot}
                  download={`screenshot_${new Date().getTime()}.png`}
                  className="btn btn-ghost"
                  style={{ padding: '0.4rem' }}
                  title="下载图片"
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
              overflow: 'auto',
              borderRadius: 'var(--radius-md)',
              background: '#f1f5f9',
              display: 'flex',
              justifyContent: 'center',
              flex: 1
            }}>
              <img
                src={screenshot}
                alt="System Screenshot"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                  objectFit: 'contain',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}
              />
            </div>

            <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              截图时间: {new Date().toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Charts Section */}
      <div className="responsive-grid responsive-grid-2">
        {/* CPU Chart */}
        <div className="card glass-panel chart-card" style={{ padding: '1rem', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>CPU 综合使用率动态 (%)</h3>
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
                  contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid var(--color-surface-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  itemStyle={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.9rem' }}
                  labelStyle={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}
                />
                <Area type="monotone" dataKey="cpu" name="CPU (%)" stroke="var(--color-primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorCpu)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Memory Chart */}
        <div className="card glass-panel chart-card" style={{ padding: '1rem', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>内存使用率动态 (%)</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
              {history.length > 0 ? `${history[history.length - 1].memory}%` : 'N/A'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.1rem' }}>
              已用 {stats?.memory?.usedMB || '0'} MB / {stats?.memory?.totalMB || '0'} MB
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
                  contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid var(--color-surface-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  itemStyle={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.9rem' }}
                  labelStyle={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}
                />
                <Area type="monotone" dataKey="memory" name="内存 (%)" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorMem)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="responsive-grid responsive-grid-2">
        {/* Network Chart */}
        <div className="card glass-panel chart-card" style={{ padding: '1rem', minHeight: '200px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: '0.5rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>网络流量动态 (KB/s)</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ color: '#10b981' }}>↓ {history.length > 0 ? history[history.length - 1].netIn : '0'}</span>
              <span style={{ color: '#8b5cf6' }}>↑ {history.length > 0 ? history[history.length - 1].netOut : '0'}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stats?.network?.split(',').slice(0, 2).join(',') || 'N/A'} (累计)
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
                <Tooltip
                  contentStyle={{ background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(10px)', borderRadius: '8px', border: '1px solid var(--color-surface-border)', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                  itemStyle={{ fontWeight: 600, fontSize: '0.9rem' }}
                  labelStyle={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}
                />
                <Area type="monotone" dataKey="netIn" name="下载 (KB/s)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorNetIn)" isAnimationActive={false} />
                <Area type="monotone" dataKey="netOut" name="上传 (KB/s)" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorNetOut)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card glass-panel" style={{ padding: '1.25rem', minHeight: '200px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '1.5rem', flex: 1 }}>
            {/* Left Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>主机名称</h3>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats?.hostname || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>系统负载</h3>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-primary)' }}>{stats?.loadAvg || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>运行时间</h3>
                <div style={{ fontSize: '0.75rem', fontWeight: 500 }}>{stats?.uptime?.split(',')[0]?.split('up')[1]?.trim() || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>磁盘空间</h3>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{stats?.disk?.used} / {stats?.disk?.total}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>内核版本</h3>
                <div style={{ fontSize: '0.75rem', fontWeight: 500, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stats?.kernel || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>CPU 模型</h3>
                <div style={{ fontSize: '0.7rem', fontWeight: 500, textAlign: 'right', maxWidth: '120px', overflow: 'hidden', height: '1rem' }} title={stats?.cpuModel}>
                  {stats?.cpuModel || 'N/A'}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>交换分区</h3>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{stats?.swap || '0 / 0'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>架构类型</h3>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{stats?.arch || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>内存压力</h3>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{stats?.memPressure || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>系统版本</h3>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>{stats?.osVersion || 'N/A'}</div>
              </div>
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', paddingBottom: '0.3rem' }}>
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>网络累计</h3>
                <div style={{ fontSize: '0.7rem', fontWeight: 500, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {stats?.network?.split(',')[0]?.replace('in', '↓') || 'N/A'}
                </div>
              </div>
              <div className="flex-between">
                <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: 0 }}>电池状态</h3>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#10b981' }}>{stats?.battery || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid">
        {/* Command Execution */}
        <div className="card glass-panel terminal-section" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', minHeight: '550px', maxWidth: '100%', overflow: 'hidden' }}>
          <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h2 className="card-title" style={{ margin: 0 }}>终端命令执行</h2>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {quickCommands.map((q, i) => (
              <button
                key={i}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setCmd(q.cmd)}
                style={{
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.05)',
                  color: 'var(--color-primary)',
                  border: '1px solid rgba(59, 130, 246, 0.1)',
                  height: 'auto'
                }}
              >
                {q.label}
              </button>
            ))}
          </div>

          <form onSubmit={executeCommand} className="command-form" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              className="input terminal-input"
              placeholder="输入命令 或 需求..."
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              disabled={isExecuting}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            {isExecuting ? (
              <button
                type="button"
                className="btn btn-danger"
                onClick={stopCommand}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <Square size={16} fill="white" />
                停止
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>执行</button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                fontSize: '0.85rem',
                padding: '0 1rem',
                height: 'auto',
                background: 'rgba(139, 92, 246, 0.05)',
                color: '#8b5cf6',
                border: '1px solid rgba(139, 92, 246, 0.1)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                whiteSpace: 'nowrap'
              }}
              onClick={translateAICommand}
              disabled={aiLoading || !cmd || isExecuting}
            >
              <Sparkles size={16} className={aiLoading ? 'animate-pulse' : ''} />
              {aiLoading ? '翻译中...' : 'AI 翻译'}
            </button>
          </form>
          <div
            ref={terminalRef}
            className="terminal-output"
            style={{
              flex: 1,
              background: '#ffffff',
              color: '#1e293b',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-surface-border)',
              padding: '1.25rem',
              overflowY: 'auto',
              fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              fontSize: '0.85rem',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)',
              minHeight: '550px',
              position: 'relative',
              lineHeight: '1.6'
            }}>
            {cmdResult || (
              <span style={{ color: '#94a3b8' }}>
                结果将在此处显示...
              </span>
            )}
            {cmdResult && !cmdResult.includes('执行中') && !cmdResult.includes('翻译') && (
              <button
                onClick={analyzeOutput}
                disabled={isAnalyzing}
                style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  background: 'rgba(59, 130, 246, 0.1)',
                  color: 'var(--color-primary)',
                  border: '1px solid rgba(59, 130, 246, 0.2)',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  zIndex: 2,
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.2s'
                }}
              >
                <Sparkles size={14} className={isAnalyzing ? 'animate-pulse' : ''} />
                {isAnalyzing ? '分析中...' : 'AI 分析输出'}
              </button>
            )}
          </div>

          {analysisResult && (
            <div style={{
              marginTop: '1.25rem', padding: '1.25rem',
              background: 'rgba(59, 130, 246, 0.03)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(59, 130, 246, 0.1)',
              animation: 'slideInDown 0.3s ease',
              maxWidth: '100%',
              overflowX: 'auto',
              wordBreak: 'break-word'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--color-primary)' }}>
                <Brain size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI 输出诊断建议</span>
                <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
