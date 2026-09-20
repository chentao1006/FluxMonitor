"use client";

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useSettings } from '@/lib/SettingsContext';
import { streamAiContent } from '@/lib/aiStream';
import {
  Filter,
  Info,
  Network,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

interface PortEntry {
  protocol: string;
  port: number;
  address: string;
  endpoint: string;
  endpoints?: string[];
  connectionCount?: number;
  state: string;
}

interface PortProcessGroup {
  pid: string;
  command: string;
  user: string;
  cpu: string;
  mem: string;
  ppid: string;
  start: string;
  fullCommand: string;
  ports: PortEntry[];
}

interface PortSummary {
  processes: number;
  ports: number;
  listening: number;
}

export default function PortsPage() {
  const { t } = useLanguage();
  const { config } = useSettings();
  const [groups, setGroups] = useState<PortProcessGroup[]>([]);
  const [summary, setSummary] = useState<PortSummary>({ processes: 0, ports: 0, listening: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [processTooltip, setProcessTooltip] = useState<{ content: string; x: number; y: number } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPorts = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await fetch('/api/system/ports');
      const data = await res.json();
      if (data.success) {
        setGroups(data.data || []);
        setSummary(data.summary || { processes: 0, ports: 0, listening: 0 });
      }
    } catch (error) {
      console.error('Failed to fetch ports', error);
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchPorts();
  }, [fetchPorts]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchPorts(true), 20000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchPorts]);

  const filteredGroups = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return groups
      .map(group => ({
        ...group,
        ports: group.ports.filter(port => {
          const matchesState = stateFilter === 'all' || port.state === stateFilter;
          const haystack = [
            group.command,
            group.pid,
            group.user,
            group.fullCommand,
            port.protocol,
            String(port.port),
            port.endpoint,
            port.state,
          ].join(' ').toLowerCase();

          return matchesState && (!keyword || haystack.includes(keyword));
        }),
      }))
      .filter(group => group.ports.length > 0);
  }, [groups, searchTerm, stateFilter]);

  const stateOptions = useMemo(() => {
    const states = new Set<string>();
    groups.forEach(group => group.ports.forEach(port => {
      if (port.state) states.add(port.state);
    }));
    return Array.from(states).sort();
  }, [groups]);

  const handleAction = async (group: PortProcessGroup, action: 'kill' | 'term') => {
    if (!window.confirm(t.ports.killConfirm.replace('{name}', group.command).replace('{pid}', group.pid))) return;

    try {
      const res = await fetch('/api/system/ports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, pid: group.pid }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPorts();
      } else {
        alert(`${t.common.actionFailed}: ${data.error}`);
      }
    } catch {
      alert(t.common.networkError);
    }
  };

  const handleAiAnalyze = () => {
    setAnalyzing(true);
    setAiAnalysis('');
    
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const snapshot = filteredGroups.map(group => ({
      pid: group.pid,
      command: group.command,
      user: group.user,
      cpu: group.cpu,
      mem: group.mem,
      ports: group.ports.map(port => `${port.protocol} ${port.endpoint} ${port.state}`.trim()),
      fullCommand: group.fullCommand,
    }));

    const promptText = t.ports.aiPrompt
      .replace('{lang}', t.common.aiResponseLang)
      .replace('{summary}', JSON.stringify(summary, null, 2))
      .replace('{ports}', JSON.stringify(snapshot, null, 2));

    streamAiContent(
      {
        prompt: promptText,
        systemPrompt: 'You are a macOS system and network operations expert. Analyze local port usage and give concise, actionable findings.',
        config: config?.ai,
        signal: abortControllerRef.current.signal,
      },
      (chunk) => setAiAnalysis(chunk),
      () => setAnalyzing(false),
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

  const getPortStateLabel = (state: string) => {
    return (t.ports.states as Record<string, string>)[state] || state || t.common.unknown;
  };

  const getProcessDetails = (group: PortProcessGroup) => [
    `${t.processes.user}: ${group.user || t.common.unknown}`,
    `CPU ${group.cpu}%`,
    `MEM ${group.mem}%`,
    group.ppid ? `PPID ${group.ppid}` : '',
    group.start ? `${t.processes.startTime}: ${group.start}` : '',
    group.fullCommand || group.command,
  ].filter(Boolean).join('\n');

  const showProcessTooltip = (event: React.MouseEvent<HTMLElement> | React.FocusEvent<HTMLElement>, group: PortProcessGroup) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const tooltipWidth = Math.min(520, window.innerWidth - 32);
    const x = Math.min(
      Math.max(rect.left + rect.width / 2, tooltipWidth / 2 + 16),
      window.innerWidth - tooltipWidth / 2 - 16
    );

    setProcessTooltip({
      content: getProcessDetails(group),
      x,
      y: rect.bottom + 10,
    });
  };

  return (
    <div className="grid no-scrollbar ports-page" style={{ gap: '1rem', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-between dashboard-page-header" style={{ flexWrap: 'wrap', gap: '1rem', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)', display: 'flex' }}>
            <Network size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.ports.title}</h1>
        </div>
        <div className="port-header-actions mobile-full-width">
          <div className="port-refresh-actions">
            <label className="port-toolbar-auto">
              <span>{t.common.autoRefresh}</span>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={event => setAutoRefresh(event.target.checked)}
              />
            </label>
            <button className="btn btn-primary" onClick={() => fetchPorts()} disabled={loading} style={{ gap: '0.5rem' }}>
              <RefreshCw size={18} className={(loading || refreshing) ? 'animate-spin' : ''} />
              {t.common.refresh}
            </button>
          </div>
          <button className="btn btn-info" onClick={handleAiAnalyze} disabled={analyzing || loading || filteredGroups.length === 0} style={{ gap: '0.5rem' }}>
            <Sparkles size={16} />
            {analyzing ? t.common.analyzing : t.common.analyze}
          </button>
        </div>
      </div>

      <div className="port-toolbar no-scrollbar" style={{ padding: 0 }}>
        <div className="port-toolbar-stats">
          <span><strong>{summary.ports}</strong>{t.ports.usedPorts}</span>
          <span><strong>{summary.processes}</strong>{t.ports.processGroups}</span>
          <span><strong>{summary.listening}</strong>{t.ports.listeningPorts}</span>
        </div>

        <div className="port-toolbar-search">
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder={t.ports.searchPlaceholder}
              style={{ paddingLeft: '2.5rem', paddingRight: searchTerm ? '2.5rem' : '0.75rem', fontSize: '0.85rem' }}
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
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
                  padding: '4px',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        <select
          className="input port-toolbar-select"
          value={stateFilter}
          onChange={event => setStateFilter(event.target.value)}
        >
          <option value="all">{t.ports.allStates}</option>
          {stateOptions.map(state => (
            <option key={state} value={state}>{state}</option>
          ))}
        </select>

      </div>

      {(aiAnalysis || analyzing) && (
        <div className="card glass-panel" style={{ padding: '1rem', borderColor: 'var(--color-primary)' }}>
          <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
            <div className="flex-center" style={{ gap: '0.5rem', color: 'var(--color-primary)', fontWeight: 600 }}>
              <Sparkles size={18} />
              {t.ports.aiAnalysisTitle}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {analyzing && <RefreshCw size={16} className="animate-spin" color="var(--color-primary)" />}
              <button
                onClick={() => {
                  abortControllerRef.current?.abort();
                  setAiAnalysis('');
                  setAnalyzing(false);
                }}
                title={t.common.close}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', padding: '0.2rem' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="ai-output-block no-scrollbar markdown-body" style={{ maxHeight: '220px', overflowY: 'auto', fontSize: '0.9rem', lineHeight: 1.6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiAnalysis || t.ports.aiAnalyzing}</ReactMarkdown>
            {aiAnalysis.includes(t.common.errors.aiConfigMissing) && (
              <div style={{ marginTop: '0.75rem' }}>
                <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="port-groups no-scrollbar">
        {loading && groups.length === 0 ? (
          <div className="card glass-panel flex-center" style={{ minHeight: '240px', flexDirection: 'column', gap: '1rem' }}>
            <RefreshCw size={32} className="animate-spin" color="var(--color-primary)" />
            <p>{t.common.loading}</p>
          </div>
        ) : filteredGroups.length > 0 ? (
          filteredGroups.map(group => (
            <section key={group.pid} className="card glass-panel" style={{ padding: '1rem' }}>
              <div className="flex-between" style={{ alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', wordBreak: 'break-word' }}>{group.command}</h2>
                    <span
                      className="process-info-trigger"
                      aria-label={getProcessDetails(group)}
                      tabIndex={0}
                      onMouseEnter={(event) => showProcessTooltip(event, group)}
                      onMouseLeave={() => setProcessTooltip(null)}
                      onFocus={(event) => showProcessTooltip(event, group)}
                      onBlur={() => setProcessTooltip(null)}
                    >
                      <Info size={16} />
                    </span>
                    <span className="badge badge-warning">PID {group.pid}</span>
                    <span className="badge badge-success">{t.ports.portsInGroup.replace('{count}', group.ports.length.toString())}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button className="btn btn-warning btn-sm" onClick={() => handleAction(group, 'term')} style={{ gap: '0.35rem' }} title="SIGTERM">
                    <XCircle size={15} />
                    {t.ports.exitProcess}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleAction(group, 'kill')} style={{ padding: '0.35rem 0.55rem' }} title="SIGKILL">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className="port-chip-grid">
                {group.ports.map(port => (
                  <div key={`${port.protocol}-${port.endpoint}-${port.state}`} className="port-chip">
                    <div className="port-chip-main">
                      <span className={`port-dot ${port.state === 'LISTEN' ? 'listen' : port.state === 'ESTABLISHED' ? 'active' : ''}`} />
                      <span className="port-number">{port.port}</span>
                      <span className="protocol-label">{port.protocol}</span>
                      {(port.connectionCount || 1) > 1 && (
                        <span className="connection-count">x{port.connectionCount}</span>
                      )}
                      <span className="port-state-badge" title={port.state || t.common.unknown}>
                        {getPortStateLabel(port.state)}
                      </span>
                    </div>
                    <div className="port-endpoint" title={port.endpoints?.join('\n')}>
                      {port.endpoint}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <div className="card glass-panel flex-center" style={{ minHeight: '260px', flexDirection: 'column', gap: '1rem', color: 'var(--color-text-muted)' }}>
            <Filter size={48} style={{ opacity: 0.25 }} />
            <p>{t.ports.noPorts}</p>
          </div>
        )}
      </div>

      {processTooltip && (
        <div
          className="process-info-tooltip"
          style={{
            left: processTooltip.x,
            top: processTooltip.y,
          }}
        >
          {processTooltip.content}
        </div>
      )}

      <style jsx>{`
        .ports-page {
          height: calc(100vh - 24px);
          overflow-y: hidden;
        }
        .port-groups {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding-bottom: 0.5rem;
        }
        .port-toolbar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
          overflow-x: auto;
          overflow-y: hidden;
          flex-shrink: 0;
        }

        .port-header-actions {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .port-refresh-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .port-toolbar-stats {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
          padding: 0.35rem 0.55rem;
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          border: 1px solid var(--color-surface-border);
          color: var(--color-text-muted);
          font-size: 0.72rem;
          white-space: nowrap;
        }

        .port-toolbar-stats span {
          display: inline-flex;
          align-items: baseline;
          gap: 0.2rem;
        }

        .port-toolbar-stats strong {
          color: var(--color-primary);
          font-size: 0.95rem;
        }

        .port-toolbar-search {
          flex: 1 1 260px;
          min-width: 220px;
        }

        .port-toolbar-select {
          width: 130px;
          height: 38px;
          padding: 0.45rem 0.65rem;
          font-size: 0.82rem;
          flex-shrink: 0;
        }

        .port-toolbar-auto {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          height: 38px;
          padding: 0 0.65rem;
          border-radius: var(--radius-sm);
          background: var(--color-bg);
          border: 1px solid var(--color-surface-border);
          color: var(--color-text-muted);
          font-size: 0.78rem;
          white-space: nowrap;
          flex-shrink: 0;
          cursor: pointer;
        }

        .port-toolbar-auto input {
          width: 15px;
          height: 15px;
          cursor: pointer;
        }

        .process-info-trigger {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 999px;
          color: var(--color-text-muted);
          background: var(--color-bg);
          border: 1px solid var(--color-surface-border);
          cursor: help;
          flex-shrink: 0;
        }

        .process-info-trigger:hover,
        .process-info-trigger:focus-visible {
          color: var(--color-primary);
          border-color: var(--color-primary);
          outline: none;
        }

        .process-info-tooltip {
          position: fixed;
          transform: translateX(-50%);
          z-index: 2000;
          width: max-content;
          max-width: min(520px, calc(100vw - 32px));
          padding: 0.7rem 0.8rem;
          border-radius: var(--radius-md);
          background: var(--color-surface-bg);
          color: var(--color-text);
          border: 1px solid var(--color-surface-border);
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          font-size: 0.75rem;
          font-family: monospace;
          font-weight: 500;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          pointer-events: none;
        }

        .port-chip-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
          gap: 0.55rem;
        }

        .port-chip {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          min-width: 0;
          min-height: 56px;
          padding: 0.55rem 0.65rem;
          border: 1px solid var(--color-surface-border);
          border-radius: var(--radius-sm);
          background: var(--color-bg);
        }

        .port-chip-main {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          min-width: 0;
          width: 100%;
          white-space: nowrap;
        }

        .port-state-badge {
          margin-left: auto;
          flex-shrink: 0;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          background: var(--color-badge-warning-bg);
          color: var(--color-warning);
          font-size: 0.66rem;
          font-weight: 700;
          line-height: 1.25;
          white-space: nowrap;
        }

        .port-endpoint {
          width: 100%;
          min-width: 0;
          color: var(--color-text-muted);
          font-size: 0.78rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .port-number {
          color: var(--color-primary);
          font-family: monospace;
          font-size: 1.08rem;
          font-weight: 800;
          line-height: 1;
          flex-shrink: 0;
        }

        .protocol-label {
          color: var(--color-text-muted);
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          flex-shrink: 0;
        }

        .connection-count {
          padding: 0.1rem 0.4rem;
          border-radius: 999px;
          background: var(--color-primary-light);
          color: var(--color-primary);
          font-size: 0.68rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .port-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
          background: var(--color-text-muted);
          flex-shrink: 0;
        }

        .port-dot.listen {
          background: var(--color-success);
          box-shadow: 0 0 0 4px var(--color-badge-success-bg);
        }

        .port-dot.active {
          background: var(--color-warning);
          box-shadow: 0 0 0 4px var(--color-badge-warning-bg);
        }

        .code-block {
          background: var(--color-bg);
          border: 1px solid var(--color-surface-border);
          border-radius: var(--radius-sm);
          padding: 0.65rem;
          color: var(--color-text-muted);
          font-family: monospace;
        }

        @media (max-width: 768px) {
          .ports-page {
            height: auto;
            min-height: 100%;
            overflow-y: visible;
          }

          .port-groups {
            flex: none;
            overflow-y: visible;
          }

          .port-header-actions {
            justify-content: flex-end;
          }

          .port-refresh-actions {
            flex: 1;
          }

          .port-refresh-actions .btn,
          .port-header-actions > .btn {
            flex: 1;
          }

          .port-toolbar {
            padding: 0.6rem;
            gap: 0.55rem;
          }

          .port-toolbar-search {
            min-width: 190px;
          }

          .port-chip-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
