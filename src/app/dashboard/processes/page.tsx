"use client";

import { useEffect, useState, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  Trash2,
  XOctagon,
  User,
  Settings,
  Filter,
  ArrowUpDown,
  Cpu,
  Database,
  Info,
  Layers
} from 'lucide-react';

interface Process {
  pid: string;
  cpu: string;
  mem: string;
  user: string;
  command: string;
}

export default function ProcessManager() {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'cpu' | 'mem' | 'pid' | 'command' | 'user'>('cpu');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/system/processes?limit=100&sort=${sortField === 'mem' ? 'mem' : 'cpu'}`);
      const data = await res.json();
      if (data.success) {
        setProcesses(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch processes', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProcesses();
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchProcesses, refreshInterval);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, sortField]);

  const toggleSort = (field: 'cpu' | 'mem' | 'pid' | 'command' | 'user') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleAction = async (pid: string, action: 'kill' | 'term') => {
    const actionName = action === 'kill' ? '强制结束 (SIGKILL)' : '正常终止 (SIGTERM)';
    if (!window.confirm(`确定要 ${actionName} 进程 ${pid} 吗？`)) return;

    try {
      const res = await fetch('/api/system/processes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pid }),
      });
      const data = await res.json();
      if (data.success) {
        fetchProcesses();
      } else {
        alert(`操作失败: ${data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    }
  };

  const uniqueUsers = useMemo(() => {
    const users = new Set(processes.map(p => p.user));
    return Array.from(users).sort();
  }, [processes]);

  const filteredAndSortedProcesses = useMemo(() => {
    return processes
      .filter(p => {
        const matchesSearch = p.command.toLowerCase().includes(searchTerm.toLowerCase()) || p.pid.includes(searchTerm);
        const matchesUser = filterUser === 'all' || p.user === filterUser;
        return matchesSearch && matchesUser;
      })
      .sort((a, b) => {
        let valA: any = a[sortField as keyof Process];
        let valB: any = b[sortField as keyof Process];

        if (sortField === 'cpu' || sortField === 'mem') {
          valA = parseFloat(valA);
          valB = parseFloat(valB);
        } else if (sortField === 'pid') {
          valA = parseInt(valA);
          valB = parseInt(valB);
        }

        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [processes, searchTerm, sortField, sortOrder, filterUser]);

  return (
    <div className="grid no-scrollbar" style={{ gap: '1.5rem', maxHeight: '100%', overflowY: 'auto' }}>
      <div className="flex-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Layers size={28} color="var(--color-primary)" />
          <h1 className="card-title" style={{ fontSize: '1.75rem', margin: 0 }}>进程管理</h1>
          <span className="badge badge-success" style={{ textTransform: 'none' }}>
            共 {processes.length} 个进程
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="flex-center glass-panel" style={{ padding: '0.25rem 0.75rem', borderRadius: 'var(--radius-sm)', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>自动刷新</span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => fetchProcesses()} disabled={loading} style={{ gap: '0.5rem' }}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card glass-panel" style={{ padding: '1rem' }}>
        <div className="responsive-grid responsive-grid-auto" style={{ gap: '1rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder="搜索进程名或 PID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <User size={18} color="var(--color-text-muted)" />
              <select
                className="input"
                value={filterUser}
                onChange={e => setFilterUser(e.target.value)}
                style={{ height: '100%', padding: '0.5rem' }}
              >
                <option value="all">所有用户</option>
                {uniqueUsers.map(user => (
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={18} color="var(--color-text-muted)" />
              <select
                className="input"
                value={refreshInterval}
                onChange={e => setRefreshInterval(parseInt(e.target.value))}
                style={{ height: '100%', padding: '0.5rem' }}
              >
                <option value={2000}>2s 刷新</option>
                <option value={5000}>5s 刷新</option>
                <option value={10000}>10s 刷新</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Process Table */}
      <div className="card glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)' }}>
                <th onClick={() => toggleSort('pid')} style={{ padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                    PID {sortField === 'pid' && <ArrowUpDown size={14} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('command')} style={{ padding: '1rem', cursor: 'pointer' }}>
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                    进程名称 {sortField === 'command' && <ArrowUpDown size={14} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('user')} style={{ padding: '1rem', cursor: 'pointer' }}>
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                    用户 {sortField === 'user' && <ArrowUpDown size={14} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('cpu')} style={{ padding: '1rem', cursor: 'pointer' }}>
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                    <Cpu size={14} /> CPU % {sortField === 'cpu' && <ArrowUpDown size={14} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('mem')} style={{ padding: '1rem', cursor: 'pointer' }}>
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.5rem' }}>
                    <Database size={14} /> MEM % {sortField === 'mem' && <ArrowUpDown size={14} />}
                  </div>
                </th>
                <th style={{ padding: '1rem', textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProcesses.map((p, i) => (
                <tr key={p.pid + i} className="hover-scale" style={{ borderBottom: '1px solid rgba(0,0,0,0.03)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '0.85rem 1rem', fontSize: '0.9rem', fontFamily: 'monospace' }}>{p.pid}</td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text)' }}>{p.command}</div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{p.user}</span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span className={`badge ${parseFloat(p.cpu) > 50 ? 'badge-danger' : parseFloat(p.cpu) > 10 ? 'badge-warning' : 'badge-success'}`}>
                      {p.cpu}%
                    </span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <span style={{ fontWeight: 500 }}>{p.mem}%</span>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.4rem', color: 'var(--color-warning)' }}
                        onClick={() => handleAction(p.pid, 'term')}
                        title="SIGTERM (正常终止)"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: '0.4rem', color: 'var(--color-danger)' }}
                        onClick={() => handleAction(p.pid, 'kill')}
                        title="SIGKILL (强制强制)"
                      >
                        <XOctagon size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAndSortedProcesses.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    <div className="flex-center" style={{ flexDirection: 'column', gap: '1rem' }}>
                      <Filter size={48} style={{ opacity: 0.2 }} />
                      <p>未找到匹配的进程</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex-center" style={{ gap: '0.5rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
        <Info size={14} />
        <span>提示: 正常终止 (SIGTERM) 会尝试保存数据，强制结束 (SIGKILL) 则是立即停止。</span>
      </div>

      <style jsx>{`
        .hover-scale:hover {
          background: rgba(59, 130, 246, 0.03);
          transform: translateX(4px);
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
