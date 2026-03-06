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
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  const fetchProcesses = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/system/processes?limit=1000&sort=${sortField === 'mem' ? 'mem' : 'cpu'}`);
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
      <div className="flex-between dashboard-page-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Layers size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>进程管理</h1>
          <span className="badge badge-success" style={{ textTransform: 'none', height: 'fit-content' }}>
            共 {processes.length} 个进程
          </span>
        </div>
        <div className="flex-between mobile-full-width" style={{ gap: '0.75rem' }}>
          <div className="flex-center glass-panel" style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', gap: '0.5rem', flex: 1 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>自动刷新</span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => fetchProcesses()} disabled={loading} style={{ gap: '0.5rem', flex: 1 }}>
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

      {/* Process Table / Card List */}
      <div className="card glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="process-table-container">
          <table className="process-table">
            <thead>
              <tr style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)' }}>
                <th onClick={() => toggleSort('pid')} className="col-pid sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    PID {sortField === 'pid' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('command')} className="col-command sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    进程名称 {sortField === 'command' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('user')} className="col-user sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    用户 {sortField === 'user' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('cpu')} className="col-cpu sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    <Cpu size={12} /> CPU {sortField === 'cpu' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('mem')} className="col-mem sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    <Database size={12} /> MEM {sortField === 'mem' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th className="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProcesses.map((p, i) => (
                <tr key={p.pid + i} className="process-row hover-scale">
                  <td className="col-pid">{p.pid}</td>
                  <td className="col-command">
                    <div className="command-text">{p.command}</div>
                    <div className="mobile-only-details">
                      <span className="user-label">{p.user}</span>
                      <span className="pid-label">PID: {p.pid}</span>
                    </div>
                  </td>
                  <td className="col-user">{p.user}</td>
                  <td className="col-cpu">
                    <span className={`badge ${parseFloat(p.cpu) > 50 ? 'badge-danger' : parseFloat(p.cpu) > 10 ? 'badge-warning' : 'badge-success'}`} style={{ minWidth: '45px', textAlign: 'center' }}>
                      {p.cpu}%
                    </span>
                  </td>
                  <td className="col-mem">
                    <span style={{ fontWeight: 500 }}>{p.mem}%</span>
                  </td>
                  <td className="col-actions">
                    <div className="action-buttons">
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.4rem', color: 'var(--color-warning)' }}
                        onClick={() => handleAction(p.pid, 'term')}
                        title="SIGTERM (终止)"
                      >
                        <Trash2 size={16} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.4rem', color: 'var(--color-danger)' }}
                        onClick={() => handleAction(p.pid, 'kill')}
                        title="SIGKILL (强制)"
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
        .process-table-container {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .process-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          min-width: 600px; /* Force minimum width to prevent squashing */
        }
        .process-table th, .process-table td {
          padding: 1rem;
          text-align: left;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .col-pid { width: 80px; font-family: monospace; }
        .col-command { width: auto; font-weight: 600; }
        .col-user { width: 100px; color: var(--color-text-muted); }
        .col-cpu { width: 90px; }
        .col-mem { width: 90px; }
        .col-actions { width: 100px; text-align: right; }
        
        .sortable { cursor: pointer; transition: background 0.2s; }
        .sortable:hover { background: rgba(59, 130, 246, 0.05); }

        .action-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 0.25rem;
        }

        .command-text {
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mobile-only-details {
          display: none;
          gap: 0.5rem;
          font-size: 0.75rem;
          font-weight: 400;
          color: var(--color-text-muted);
          margin-top: 0.25rem;
        }

        .process-row {
          border-bottom: 1px solid rgba(0,0,0,0.03);
          transition: all 0.2s;
        }
        
        @media (max-width: 768px) {
          .process-table {
            table-layout: auto;
            min-width: 100%;
          }
          .col-pid, .col-user {
            display: none;
          }
          .col-command {
            width: 100%;
            max-width: none;
          }
          .command-text {
            max-width: 150px;
          }
          .mobile-only-details {
            display: flex;
          }
          .process-table td, .process-table th {
            padding: 0.75rem 0.5rem;
          }
          .col-cpu, .col-mem {
            width: 70px;
          }
          .col-actions {
            width: 80px;
          }
        }

        @media (max-width: 480px) {
           .command-text {
             max-width: 100px;
           }
           .col-cpu, .col-mem {
             padding: 0.75rem 0.25rem !important;
             font-size: 0.8rem;
           }
           .badge {
             padding: 0.2rem 0.4rem;
             font-size: 0.7rem;
           }
        }

        .hover-scale:hover {
          background: rgba(59, 130, 246, 0.03);
          transform: translateX(4px);
        }
      `}</style>
    </div>
  );
}
