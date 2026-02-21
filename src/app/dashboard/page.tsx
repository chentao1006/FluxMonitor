"use client";

import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { XSquare, Camera, X, Maximize2, Download } from 'lucide-react';

export default function DashboardOverview() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [processes, setProcesses] = useState<any[]>([]);
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

      const resProc = await fetch('/api/system/processes');
      const dataProc = await resProc.json();
      if (dataProc.success) setProcesses(dataProc.data);
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

  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setCmdResult('执行中...');
    try {
      const res = await fetch('/api/system/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      if (data.success) {
        setCmdResult(data.stdout || data.stderr || '执行成功，无输出');
      } else {
        setCmdResult(`错误: ${data.details || data.error}`);
      }
    } catch (e) {
      setCmdResult('网络请求失败');
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

  const killProcess = async (pid: string, name: string) => {
    if (!window.confirm(`⚠️ 高危操作：\n\n确定要强行终止进程 [${name}] (PID: ${pid}) 吗？\n如果这是系统关键服务可能会导致死机或重启，请确认你的操作！`)) {
      return;
    }

    try {
      const res = await fetch('/api/system/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'kill', pid }),
      });
      const data = await res.json();
      if (data.success) {
        alert('终止成功');
        fetchStats();
      } else {
        alert(`终止失败: ${data.error || data.details}`);
      }
    } catch {
      alert('网络请求失败');
    }
  };

  if (loading && !stats) return <div className="flex-center" style={{ height: '70vh' }}>加载中...</div>;

  return (
    <div className="grid">
      <div className="flex-between" style={{ marginBottom: '1.5rem', alignItems: 'center' }}>
        <h1 className="card-title" style={{ fontSize: '1.75rem', marginBottom: '0' }}>系统监控 🖥️</h1>
        <button
          className="btn btn-primary"
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
            padding: '2rem',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          <div
            className="screenshot-card glass-panel"
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90%',
              maxHeight: '90%',
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
              background: '#000',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <img
                src={screenshot}
                alt="System Screenshot"
                style={{
                  maxWidth: '100%',
                  height: 'auto',
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
        <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start', flexDirection: 'column', minHeight: '300px' }}>
          <div style={{ marginBottom: '1rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>CPU 综合使用率动态 (%)</h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              {history.length > 0 ? `${history[history.length - 1].cpu}%` : 'N/A'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              User: {stats?.cpu?.user || 0}% | Sys: {stats?.cpu?.sys || 0}% | Idle: {stats?.cpu?.idle || 0}%
            </div>
          </div>
          <div style={{ width: '100%', height: '180px', marginTop: 'auto' }}>
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
        <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start', flexDirection: 'column', minHeight: '300px' }}>
          <div style={{ marginBottom: '1rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>内存使用率动态 (%)</h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
              {history.length > 0 ? `${history[history.length - 1].memory}%` : 'N/A'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              已用 {stats?.memory?.usedMB || '0'} MB | 总计 {stats?.memory?.totalMB || '0'} MB
            </div>
          </div>
          <div style={{ width: '100%', height: '180px', marginTop: 'auto' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
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

      <div className="responsive-grid responsive-grid-2" style={{ marginTop: '1rem' }}>
        {/* Network Chart */}
        <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start', flexDirection: 'column', minHeight: '300px' }}>
          <div style={{ marginBottom: '1rem', width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>网络流量动态 (KB/s)</h3>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
              ↓ {history.length > 0 ? history[history.length - 1].netIn : '0'} | ↑ {history.length > 0 ? history[history.length - 1].netOut : '0'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              {stats?.network?.split(',').slice(0, 2).join(',') || 'N/A'} (累计)
            </div>
          </div>
          <div style={{ width: '100%', height: '180px', marginTop: 'auto' }}>
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

        <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: '1.5rem', justifyContent: 'center' }}>
          <div style={{ width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>系统负载 (1m, 5m, 15m)</h3>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-primary)' }}>
              {stats?.loadAvg || 'N/A'}
            </div>
          </div>

          <div style={{ width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>系统版本</h3>
            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>
              {stats?.osVersion || 'N/A'}
            </div>
          </div>

          <div style={{ width: '100%' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>电池状态</h3>
            <div style={{ fontSize: '1.2rem', fontWeight: 600, color: '#10b981' }}>
              {stats?.battery || 'N/A'}
            </div>
          </div>
        </div>
      </div>

      <div className="responsive-grid responsive-grid-2">
        {/* Process List */}
        <div className="card glass-panel" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <h2 className="card-title">系统进程 (Top 20)</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>PID</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>名称</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>CPU %</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>MEM %</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {processes.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{p.pid}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem', fontWeight: 500 }}>{p.command.substring(0, 20)}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                    <span className={`badge ${parseFloat(p.cpu) > 50 ? 'badge-danger' : parseFloat(p.cpu) > 10 ? 'badge-warning' : 'badge-success'}`}>
                      {p.cpu}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{p.mem}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '0.3rem', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => killProcess(p.pid, p.command.substring(0, 20))}
                      title="强行终止该进程"
                    >
                      <XSquare size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Command Execution */}
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            终端命令执行
            <button
              type="button"
              className="btn btn-ghost"
              style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', height: 'auto', background: 'linear-gradient(135deg, rgba(56,189,248,0.1), rgba(168,85,247,0.1))', color: '#8b5cf6', borderColor: 'rgba(168,85,247,0.3)' }}
              onClick={translateAICommand}
              disabled={aiLoading || !cmd}
              title="输入自然语言需求，让 AI 帮你写出正确的命令"
            >
              {aiLoading ? '翻译中...' : '🪄 自然语言转命令'}
            </button>
          </h2>
          <form onSubmit={executeCommand} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              className="input"
              placeholder="输入 bash 命令 或 自然语言提示..."
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              style={{ flex: 1, fontFamily: 'monospace' }}
            />
            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>执行</button>
          </form>
          <div style={{
            flex: 1, background: '#f1f5f9', borderRadius: 'var(--radius-sm)',
            padding: '1rem', overflowY: 'auto', fontFamily: 'monospace',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem'
          }}>
            {cmdResult || (
              <span style={{ color: 'var(--color-text-muted)' }}>
                结果将在此处显示... (请注意: 执行系统命令风险自担)
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
