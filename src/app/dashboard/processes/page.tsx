"use client";

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { streamAiContent } from '@/lib/aiStream';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSettings } from '@/lib/SettingsContext';
import {
  Search,
  RefreshCw,
  Trash2,
  XCircle,
  Square,
  XOctagon,
  User,
  Settings,
  Filter,
  ArrowUpDown,
  Cpu,
  Database,
  Info,
  Layers,
  Sparkles,
  X
} from 'lucide-react';

interface Process {
  pid: string;
  cpu: string;
  mem: string;
  user: string;
  command: string;
}

export default function ProcessManager() {
  const { t } = useLanguage();
  const { config } = useSettings();
  const [processes, setProcesses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'cpu' | 'mem' | 'pid' | 'command' | 'user'>('cpu');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [selectedPid, setSelectedPid] = useState<string | null>(null);
  const [processDetail, setProcessDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const fetchProcesses = useCallback(async () => {
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
  }, [sortField]);

  const fetchProcessDetail = async (pid: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/system/processes?pid=${pid}`);
      const data = await res.json();
      if (data.success) {
        setProcessDetail(data.data);
      }
    } catch (e) {
      console.error('Failed to fetch process detail', e);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleRowClick = (pid: string) => {
    setSelectedPid(pid);
    setAiAnalysis(null);
    fetchProcessDetail(pid);
  };

  const handleAiAnalyze = async () => {
    if (!processDetail) return;
    setAnalyzing(true);
    setAiAnalysis(null);

    const promptText = t.processes.aiPrompt
        .replace('{pid}', processDetail.pid)
        .replace('{ppid}', processDetail.ppid)
        .replace('{ppidName}', processDetail.ppidName || 'Unknown')
        .replace('{command}', processDetail.command)
        .replace('{fullCommand}', processDetail.fullCommand)
        .replace('{cpu}', processDetail.cpu)
        .replace('{mem}', processDetail.mem)
        .replace('{user}', processDetail.user)
        .replace('{start}', processDetail.start)
        .replace('{state}', processDetail.state)
        .replace('{openFiles}', processDetail.openFiles?.slice(0, 10).join('\n') || '')
        .replace('{lang}', t.common.aiResponseLang);

    streamAiContent(
      {
        prompt: promptText,
        systemPrompt: "You are a macOS system expert. Analyze the provided process information and provide a helpful diagnosis.",
        config: config?.ai
      },
      (chunk) => {
        setAiAnalysis(chunk);
      },
      () => {
        setAnalyzing(false);
      },
      (err) => {
        if (err === 'AI_CONFIG_MISSING') {
          setAiAnalysis(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
        } else {
          setAiAnalysis(`${t.common.error}: ${err}`);
        }
        setAnalyzing(false);
      }
    );
  };

  useEffect(() => {
    fetchProcesses();
  }, [fetchProcesses]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchProcesses, refreshInterval);
    }
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchProcesses]);

  const getStateMessage = (state: string) => {
    const s = state.charAt(0);
    const messages = t.processes.states;
    return messages[s as keyof typeof messages] || messages.unknown;
  };

  const toggleSort = (field: 'cpu' | 'mem' | 'pid' | 'command' | 'user') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleAction = async (pid: string, action: 'kill' | 'term') => {
    if (!window.confirm(t.processes.killConfirm.replace('{name}', pid).replace('{pid}', pid))) return;

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
        alert(`${t.common.actionFailed}: ${data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
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
    <div className="grid no-scrollbar" style={{ gap: '1rem', height: 'calc(100vh - 24px)', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-between dashboard-page-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Layers size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.processes.title}</h1>
          <span className="badge badge-success" style={{ textTransform: 'none', height: 'fit-content' }}>
            {t.processes.processes.replace('{count}', filteredAndSortedProcesses.length.toString())}
          </span>
        </div>
        <div className="flex-between mobile-full-width" style={{ gap: '0.75rem' }}>
          <div className="flex-center glass-panel" style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', gap: '0.5rem', flex: 1 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{t.common.autoRefresh}</span>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => fetchProcesses()} disabled={loading} style={{ gap: '0.5rem', flex: 1 }}>
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            {t.common.refresh}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card glass-panel" style={{ padding: '1rem' }}>
        <div className="responsive-grid responsive-grid-auto" style={{ gap: '1rem' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder={t.common.search}
              style={{ paddingLeft: '2.5rem', paddingRight: searchTerm ? '2.5rem' : '0.75rem', fontSize: '0.85rem' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px'
                }}
              >
                <X size={14} />
              </button>
            )}
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
                <option value="all">{t.logs.category}</option>
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
                <option value={2000}>2s</option>
                <option value={5000}>5s</option>
                <option value={10000}>10s</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Process Table / Card List */}
      <div className="card glass-panel" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <div className="process-table-container" style={{ flex: 1, overflowY: 'auto' }}>
          <table className="process-table">
            <thead>
              <tr style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)' }}>
                <th onClick={() => toggleSort('pid')} className="col-pid sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    {t.processes.pid} {sortField === 'pid' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('command')} className="col-command sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    {t.processes.name} {sortField === 'command' && <ArrowUpDown size={12} />}
                  </div>
                </th>
                <th onClick={() => toggleSort('user')} className="col-user sortable">
                  <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem' }}>
                    {t.processes.user} {sortField === 'user' && <ArrowUpDown size={12} />}
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
                <th className="col-actions">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedProcesses.map((p, i) => (
                <tr
                  key={p.pid}
                  className={`process-row hover-scale ${selectedPid === p.pid ? 'selected' : ''}`}
                  onClick={() => handleRowClick(p.pid)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="col-pid">{p.pid}</td>
                  <td className="col-command">
                    <div className="command-text">{p.command}</div>
                    <div className="mobile-only-details">
                      <span className="user-label">{p.user}</span>
                      <span className="pid-label">{t.processes.pid}: {p.pid}</span>
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
                  <td className="col-actions" onClick={(e) => e.stopPropagation()}>
                    <div className="action-buttons">
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.4rem', color: 'var(--color-warning)' }}
                        onClick={() => handleAction(p.pid, 'term')}
                        title="SIGTERM"
                      >
                        <XCircle size={16} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.4rem', color: 'var(--color-danger)' }}
                        onClick={() => handleAction(p.pid, 'kill')}
                        title="SIGKILL"
                      >
                        <Trash2 size={16} />
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
                      <p>{t.common.none}</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>



      {/* Detail Modal */}
      {selectedPid && (
        <div className="modal-overlay" onClick={() => setSelectedPid(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            {/* Modal Header */}
            <div className="flex-between" style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--color-surface-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
                  <Info size={20} color="var(--color-primary)" />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: '1.25rem' }}>{t.processes.details}</h2>
                  <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>PID: {selectedPid}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {processDetail && !loadingDetail && !aiAnalysis && !analyzing && (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ gap: '0.4rem', padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    onClick={() => handleAiAnalyze()}
                  >
                    <Sparkles size={14} />
                    {t.processes.aiAnalyze}
                  </button>
                )
                }
                <button className="btn btn-ghost" onClick={() => setSelectedPid(null)} style={{ padding: '0.5rem' }}>
                  <XOctagon size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body - Scrollable */}
            <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem' }}>
              {loadingDetail ? (
                <div className="flex-center" style={{ padding: '4rem', flexDirection: 'column', gap: '1rem' }}>
                  <RefreshCw size={32} className="animate-spin" color="var(--color-primary)" />
                  <p>{t.common.loading}</p>
                </div>
              ) : processDetail ? (
                <>
                  {/* AI Analysis Result Section - Show only if analyzing or has result */}
                  {(aiAnalysis || analyzing) && (
                    <div style={{ marginBottom: '0.5rem', paddingBottom: '1.5rem', borderBottom: '1px dashed var(--color-surface-border)' }}>
                      <div className="card" style={{ background: 'var(--color-bg)', padding: '1.25rem', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)', boxShadow: '0 4px 20px var(--color-shadow)' }}>
                        <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
                          <div className="flex-center" style={{ gap: '0.5rem', color: 'var(--color-primary)' }}>
                            <Sparkles size={18} />
                            <span style={{ fontWeight: 600 }}>{t.processes.aiAnalysisTitle}</span>
                            {analyzing && <span className="text-xs text-[var(--color-text-muted)] animate-pulse ml-2" style={{ fontStyle: 'italic' }}>{t.processes.aiAnalyzing || ''}...</span>}
                          </div>
                          {analyzing && <RefreshCw size={16} className="animate-spin" color="var(--color-primary)" />}
                        </div>
                        
                        <div className="ai-output-block no-scrollbar markdown-body" style={{ fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.6, maxHeight: '300px', overflowY: 'auto' }}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis || (analyzing ? t.processes.aiAnalyzing : '')}</ReactMarkdown>
                          {aiAnalysis?.includes(t.common.errors.aiConfigMissing) && (
                            <div style={{ marginTop: '0.75rem' }}>
                              <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="detail-grid">
                    <div className="detail-item full-width">
                      <label>{t.processes.name}</label>
                      <div className="value" style={{ fontWeight: 600, color: 'var(--color-primary)', fontSize: '1.1rem', wordBreak: 'break-all' }}>{processDetail.command}</div>
                    </div>
                    <div className="detail-item">
                      <label>{t.processes.user}</label>
                      <div className="value">{processDetail.user}</div>
                    </div>
                    <div className="detail-item">
                      <label>{t.processes.parentPid}</label>
                      <div className="value">
                        {(!processDetail.ppid || processDetail.ppid === '0' || processDetail.ppid === '1') ? (
                          <span>{processDetail.ppid} (System)</span>
                        ) : (
                          <button
                            onClick={() => handleRowClick(processDetail.ppid)}
                            className="btn-link"
                            title={t.common.details}
                            style={{
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              margin: 0,
                              font: 'inherit',
                              color: 'var(--color-primary)',
                              cursor: 'pointer',
                              textDecoration: 'underline',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                          >
                            {processDetail.ppid}
                            {processDetail.ppidName && (
                              <span style={{ fontSize: '0.85rem', color: 'inherit', opacity: 0.8 }}>
                                ({processDetail.ppidName})
                              </span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="detail-item">
                      <label>{t.processes.state}</label>
                      <div className="value" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-info">{processDetail.state}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                          ({getStateMessage(processDetail.state)})
                        </span>
                      </div>
                    </div>
                    <div className="detail-item">
                      <label>{t.processes.startTime} / {t.processes.cpuTime}</label>
                      <div className="value">
                        {processDetail.start} <span style={{ color: 'var(--color-text-muted)', margin: '0 0.3rem', opacity: 0.5 }}>|</span> {processDetail.time}
                      </div>
                    </div>
                    <div className="detail-item full-width">
                      <label>{t.processes.fullCommand}</label>
                      <div className="value code-block" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                        {processDetail.fullCommand}
                      </div>
                    </div>
                    <div className="detail-item full-width">
                      <label>{t.processes.openFiles}</label>
                      <div className="value code-block" style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem' }}>
                        {processDetail.openFiles && processDetail.openFiles.length > 0 ? (
                          processDetail.openFiles.map((f: string, idx: number) => (
                            <div key={idx} style={{ padding: '0.2rem 0', borderBottom: '1px solid var(--color-surface-border)' }}>{f}</div>
                          ))
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)' }}>{t.common.none}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-center" style={{ padding: '3rem' }}>
                  <p style={{ color: 'var(--color-danger)' }}>{t.common.fetchFailed}</p>
                </div>
              )}
            </div>

            {/* Modal Footer - Fixed */}
            <div className="flex-center" style={{ padding: '1.5rem 2rem', gap: '1rem', borderTop: '1px solid var(--color-surface-border)', background: 'var(--color-surface-bg)' }}>
              <button
                className="btn btn-warning"
                style={{ flex: 1, gap: '0.5rem' }}
                onClick={() => handleAction(selectedPid, 'term')}
              >
                <XCircle size={16} />
                {t.processes.terminate}
              </button>
              <button
                className="btn btn-danger"
                style={{ flex: 1, gap: '0.5rem' }}
                onClick={() => handleAction(selectedPid, 'kill')}
              >
                <Trash2 size={16} />
                {t.processes.forceKill}
              </button>
            </div>
          </div>
        </div>
      )
      }

      <style jsx>{`
        .process-table-container {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .process-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          min-width: 800px;
        }
        .process-table th, .process-table td {
          padding: 1rem;
          text-align: left;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .process-table th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--color-bg);
          box-shadow: inset 0 -1px 0 var(--color-surface-border);
        }
        .col-pid { width: 90px; font-family: monospace; }
        .col-command { width: 35%; font-weight: 600; }
        .col-user { width: 120px; color: var(--color-text-muted); }
        .col-cpu { width: 100px; }
        .col-mem { width: 100px; }
        .col-actions { width: 100px; text-align: right; }
        
        .sortable { cursor: pointer; transition: background 0.2s; }
        .sortable:hover { background: var(--color-primary-light); }

        .action-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 0.25rem;
        }

        .command-text {
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
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
          border-bottom: 1px solid var(--color-surface-border);
          transition: all 0.2s;
        }

        .process-row.selected {
          background: var(--color-primary-light);
          border-left: 3px solid var(--color-primary);
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

        .hover-scale:hover {
          background: var(--color-primary-light);
          transform: translateX(4px);
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-content {
          padding: 2rem;
          background: var(--color-bg);
          border-radius: var(--radius-lg);
          box-shadow: 0 20px 50px var(--color-shadow);
          animation: slideUp 0.3s ease-out;
          border: 1px solid var(--color-surface-border);
          position: relative;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .detail-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 1.5rem;
        }

        .detail-item {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .detail-item.full-width {
          grid-column: span 2;
        }

        .detail-item label {
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .detail-item .value {
          font-size: 0.95rem;
          word-break: break-all;
        }

        .code-block {
          background: var(--color-surface-bg);
          padding: 0.75rem;
          border-radius: var(--radius-md);
          font-family: monospace;
          border: 1px solid var(--color-surface-border);
        }

        @media (max-width: 600px) {
          .detail-grid {
            grid-template-columns: 1fr;
          }
          .detail-item.full-width {
            grid-column: span 1;
          }
        }
        .markdown-body :global(ul), .markdown-body :global(ol) {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .markdown-body :global(li) {
          margin: 0.25rem 0;
        }
        .markdown-body :global(p) {
          margin: 0.5rem 0;
        }
        .markdown-body :global(code) {
          background: var(--color-primary-light);
          padding: 0.1rem 0.3rem;
          border-radius: 3px;
          font-family: monospace;
        }
        .markdown-body :global(strong) {
          color: var(--color-primary);
        }
      `}</style>
    </div >
  );
}
