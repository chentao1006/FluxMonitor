"use client";

import { useEffect, useState, useRef } from 'react';
import { Terminal } from 'lucide-react';

export default function OpenClawDashboard() {
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [cmd, setCmd] = useState('openclaw gateway status');
  const [cmdResult, setCmdResult] = useState('');

  const [logs, setLogs] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const logsRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRunning(data.running);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    setLogs('');
    setLoadingLogs(true);

    const eventSource = new EventSource('/api/openclaw/logs');

    eventSource.onmessage = (event) => {
      let data = event.data;
      try {
        data = JSON.parse(data);
      } catch (err) {
        // use raw
      }
      setLogs((prev) => data + prev);
    };

    eventSource.addEventListener('end', () => {
      setLogs((prev) => "[日志输出停止，进程已结束]\n" + prev);
      eventSource.close();
      setLoadingLogs(false);
    });

    eventSource.onerror = () => {
      // EventSource readyState === 2 means CLOSED. We don't want noisy console errors for natural disconnects
      if (eventSource.readyState === EventSource.CLOSED) {
        setLogs((prev) => "[连接已断开]\n" + prev);
      } else {
        setLogs((prev) => "[连接中断，正在重试...]\n" + prev);
      }
      // Usually EventSource reconnects natively. If we close() here, it never reconnects.
      // eventSource.close();
      setLoadingLogs(false);
    };

    eventSourceRef.current = eventSource;
  };

  const stopLogs = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLoadingLogs(false);
  };

  useEffect(() => {
    setTimeout(() => {
      fetchStatus();
      startLogs();
    }, 0);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setCmdResult('执行中...');
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'command', command: cmd }),
      });
      const data = await res.json();
      if (data.success) {
        setCmdResult(data.stdout || data.stderr || '执行成功，无输出');
        fetchStatus();
      } else {
        setCmdResult(`错误: ${data.error}\n详情: ${data.details}`);
      }
    } catch (e) {
      console.error(e);
      setCmdResult('网络请求失败');
    }
  };

  return (
    <div className="grid">
      <div className="flex-between" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Terminal size={28} color="var(--color-primary)" />
          <h1 className="card-title" style={{ fontSize: '1.75rem', margin: 0 }}>OpenClaw 控制</h1>
        </div>
        <div className={`badge ${isRunning ? 'badge-success' : isRunning === false ? 'badge-danger' : 'badge-warning'}`}>
          {isRunning ? '运行中' : isRunning === false ? '未运行' : '检查中...'}
        </div>
      </div>

      <div className="responsive-grid responsive-grid-2">
        {/* Log Viewer */}
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <div>
              <h2 className="card-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                系统实时日志
                {loadingLogs && <span className="badge badge-success" style={{ animation: 'pulse 2s infinite' }}>监听中</span>}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                $ openclaw logs --follow
              </div>
            </div>

            <button
              className={`btn ${loadingLogs ? 'btn-danger' : 'btn-primary'}`}
              onClick={loadingLogs ? stopLogs : startLogs}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              {loadingLogs ? '停止监听' : '开始监听'}
            </button>
          </div>

          <div
            ref={logsRef}
            style={{
              height: '400px', background: '#1e293b', color: '#10b981', borderRadius: 'var(--radius-sm)',
              padding: '1rem', overflowY: 'auto', fontFamily: 'monospace',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8rem', lineHeight: 1.4
            }}>
            {logs || (
              <span style={{ color: '#64748b' }}>
                等待日志输出...
              </span>
            )}
          </div>
        </div>

        {/* Command Execution */}
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="card-title">命令执行</h2>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {[
              { label: '网关状态', cmd: 'openclaw gateway status' },
              { label: '网关重启', cmd: 'openclaw gateway restart' },
              { label: '诊断系统', cmd: 'openclaw doctor' },
              { label: '打开面板', cmd: 'openclaw dashboard' },
              { label: '配置检查', cmd: 'openclaw security audit' },
              { label: '版本信息', cmd: 'openclaw -V' },
            ].map(c => (
              <button
                key={c.cmd}
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', border: '1px solid var(--color-surface-border)' }}
                onClick={() => setCmd(c.cmd)}
              >
                {c.label}
              </button>
            ))}
          </div>

          <form onSubmit={executeCommand} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input
              type="text"
              className="input"
              value={cmd}
              onChange={e => setCmd(e.target.value)}
              placeholder="例如: openclaw gateway status"
            />
            <button type="submit" className="btn btn-primary" style={{ flexShrink: 0 }}>执行</button>
          </form>
          <div style={{
            flex: 1, background: '#1e293b', color: '#f8fafc', borderRadius: 'var(--radius-sm)',
            padding: '1rem', overflowY: 'auto', fontFamily: 'monospace', minHeight: '200px',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem'
          }}>
            {cmdResult || (
              <span style={{ color: '#64748b' }}>
                等待执行...
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
