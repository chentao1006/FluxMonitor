"use client";

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/lib/LanguageContext';
import { Play, Square, RotateCw, Trash2, FileText, Server, HardDrive, Box, Sparkles, Brain, Wand2, X } from 'lucide-react';

interface Container {
  ID: string;
  Image: string;
  Command: string;
  CreatedAt: string;
  Status: string;
  Names: string;
  Ports: string;
  Mounts: string;
}

interface DockerImage {
  ID: string;
  Repository: string;
  Tag: string;
  Size: string;
  CreatedAt: string;
  InUse?: boolean;
}

export default function DockerDashboard() {
  const { t, language, effectiveLang } = useLanguage();
  const [activeTab, setActiveTab] = useState<'containers' | 'images'>('containers');
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const [analysisResult, setAnalysisResult] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiDemand, setAiDemand] = useState('');
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [generatedCmd, setGeneratedCmd] = useState('');
  const aiCacheRef = useRef<Record<string, string>>({});
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [currentLogs, isLogsOpen]);

  useEffect(() => {
    setAnalysisResult('');
    setDiagnosisId(null);
  }, [activeTab]);

  useEffect(() => {
    setAnalysisResult('');
  }, [isLogsOpen]);

  const fetchData = useCallback(async () => {
    try {
      if (activeTab === 'containers') {
        const res = await fetch('/api/docker/containers');
        const data = await res.json();
        if (data.success) {
          setContainers(data.data);
          setError('');
        } else if (data.error === 'DOCKER_NOT_RUNNING') {
          setError(t.common.errors.dockerNotRunning);
        } else {
          setError(data.error || t.docker.fetchContainersFailed);
        }
      } else {
        const res = await fetch('/api/docker/images');
        const data = await res.json();
        if (data.success) {
          setImages(data.data);
          setError('');
        } else if (data.error === 'DOCKER_NOT_RUNNING') {
          setError(t.common.errors.dockerNotRunning);
        } else {
          setError(data.error || t.docker.fetchImagesFailed);
        }
      }
    } catch {
      setError(t.common.networkError);
    } finally {
      setLoading(false);
    }
  }, [activeTab, t.common.errors.dockerNotRunning, t.common.networkError, t.docker.fetchContainersFailed, t.docker.fetchImagesFailed]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAction = async (id: string, action: string) => {
    setActionLoading(`${id}-${action}`);
    try {
      const res = await fetch('/api/docker/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      } else {
        alert(`${t.common.error}: ${data.details || data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      setActionLoading(null);
    }
  };

  const showLogs = async (id: string, name: string) => {
    setIsLogsOpen(true);
    setDiagnosisId(id);
    setCurrentLogs('');
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/docker/logs?id=${id}`);
      const data = await res.json();
      if (data.success) {
        setCurrentLogs(data.logs || t.docker.noLogs);
      } else {
        setCurrentLogs(`${t.common.error}: ${data.details || data.error}`);
      }
    } catch (e) {
      setCurrentLogs(t.common.networkError);
    } finally {
      setLogsLoading(false);
    }
  };

  const analyzeLogs = async (id: string, name: string) => {
    if (!currentLogs || isAiAnalyzing) return;

    if (diagnosisId === id && analysisResult) {
      setAnalysisResult('');
      setDiagnosisId(null);
      return;
    }

    const cacheKey = `logs:${id}:${currentLogs.slice(-2000)}`;
    if (aiCacheRef.current[cacheKey]) {
      setAnalysisResult(aiCacheRef.current[cacheKey]);
      setDiagnosisId(id);
      return;
    }

    setIsAiAnalyzing(true);
    setAnalysisResult(t.docker.aiAnalyzingStatus);
    setDiagnosisId(id);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.docker.aiLogPrompt
            .replace('{name}', name)
            .replace('{id}', id)
            .replace('{logs}', currentLogs.slice(-4000)),
          systemPrompt: 'You are an expert Docker engineer specializing in container troubleshooting and log analysis.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      } else {
        setAnalysisResult(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setAnalysisResult(t.common.networkError);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const analyzeStatus = async (container: Container) => {
    if (isAiAnalyzing) return;

    if (diagnosisId === container.ID && analysisResult) {
      setAnalysisResult('');
      setDiagnosisId(null);
      return;
    }

    const cacheKey = `status:${container.ID}:${container.Status}`;
    if (aiCacheRef.current[cacheKey]) {
      setAnalysisResult(aiCacheRef.current[cacheKey]);
      setDiagnosisId(container.ID);
      return;
    }

    setIsAiAnalyzing(true);
    setAnalysisResult(`${t.docker.aiAnalyzingStatus} "${container.Names}" ... 🪄`);
    setDiagnosisId(container.ID);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.docker.aiStatusPrompt
            .replace('{name}', container.Names)
            .replace('{status}', container.Status)
            .replace('{image}', container.Image),
          systemPrompt: 'You are an expert DevOps engineer specializing in Docker container health and status monitoring.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      }
    } catch (e) {
      setAnalysisResult(`${t.common.error}`);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const handleGenerateCmd = async () => {
    if (!aiDemand.trim() || isAiGenerating) return;

    setIsAiGenerating(true);
    setGeneratedCmd('');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.docker.aiGenPrompt.replace('{demand}', aiDemand),
          systemPrompt: 'You are an expert Docker command generator. You provide only the shell command text.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setGeneratedCmd(data.data);
      } else if (data.error === 'AI_CONFIG_MISSING') {
        alert(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      } else {
        alert(t.common.error);
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      setIsAiGenerating(false);
    }
  };

  return (
    <div className="grid no-scrollbar animate-fade-in" style={{ height: 'calc(100vh - 24px)', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.4rem', borderRadius: 'var(--radius-md)' }}>
            <Box size={20} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.25rem', margin: 0 }}>{t.docker.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn btn-ghost mobile-full-width"
            onClick={() => setShowAiInput(!showAiInput)}
            style={{ gap: '0.5rem', height: '36px', color: 'var(--color-primary)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
          >
            <Sparkles size={18} /> {t.docker.aiAssistant}
          </button>
          {activeTab === 'images' && images.some(img => !img.InUse) && (
            <button
              className="btn btn-ghost mobile-full-width"
              onClick={() => { if (window.confirm(t.docker.pruneConfirm)) handleAction('', 'prune'); }}
              disabled={loading || actionLoading === '-prune'}
              style={{ gap: '0.5rem', height: '36px', color: 'var(--color-danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              <Trash2 size={18} /> {t.docker.prune}
            </button>
          )}
          <button className="btn btn-ghost mobile-full-width" onClick={fetchData} disabled={loading} style={{ gap: '0.5rem', height: '36px' }}>
            <RotateCw size={18} className={loading ? 'animate-spin' : ''} /> {t.common.refresh}
          </button>
        </div>
      </div>

      {showAiInput && (
        <div className="card glass-panel" style={{ marginBottom: '0.5rem', padding: '0.75rem', animation: 'slideInDown 0.3s ease', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>
            <Wand2 size={16} />
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{t.docker.aiOneClick}</span>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: generatedCmd ? '0.5rem' : 0 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="input"
                placeholder={t.docker.aiPlaceholder}
                style={{ width: '100%', paddingLeft: '0.75rem', paddingRight: aiDemand ? '2.5rem' : '0.75rem', fontSize: '0.85rem' }}
                value={aiDemand}
                onChange={(e) => setAiDemand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateCmd()}
              />
              {aiDemand && (
                <button
                  onClick={() => setAiDemand('')}
                  style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <button className="btn btn-primary" style={{ padding: '0 1rem', height: '36px' }} onClick={handleGenerateCmd} disabled={isAiGenerating || !aiDemand.trim()}>
              {isAiGenerating ? t.docker.generating : t.docker.generateCmd}
            </button>
          </div>
          {generatedCmd && (
            <div style={{ marginTop: '0.5rem', background: 'var(--color-surface-bg)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-surface-border)', position: 'relative' }}>
              <code style={{ color: 'var(--color-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}>{generatedCmd}</code>
              <button
                className="btn btn-sm btn-ghost"
                style={{ marginLeft: '1rem', border: '1px solid rgba(0,0,0,0.1)', height: '24px', padding: '0 0.5rem', fontSize: '0.7rem' }}
                onClick={() => { navigator.clipboard.writeText(generatedCmd); alert(t.common.saveSuccess); }}
              >{t.docker.copy}</button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="badge badge-danger" style={{ display: 'block', padding: '1rem', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      <div className="flex-between" style={{ marginBottom: '0.5rem', borderBottom: '1px solid var(--color-surface-border)', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="tab-scroll-container no-scrollbar" style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '2px' }}>
          <button
            className={`btn ${activeTab === 'containers' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('containers')}
            style={{ borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
          >
            <Server size={18} /> {t.docker.containers}
          </button>
          <button
            className={`btn ${activeTab === 'images' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('images')}
            style={{ borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
          >
            <HardDrive size={18} /> {t.docker.images}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', paddingRight: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{activeTab === 'containers' ? t.docker.totalContainers : t.docker.totalImages}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{activeTab === 'containers' ? containers.length : images.length}</div>
          </div>
          {activeTab === 'containers' && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: 'var(--color-success)', fontSize: '0.75rem' }}>{t.docker.running}</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{containers.filter(c => c.Status?.includes('Up')).length}</div>
            </div>
          )}
          <div className={`badge ${!error ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
            {!error ? t.docker.healthy : t.docker.errorStatus}
          </div>
        </div>
      </div>

      <div className="card glass-panel" style={{ padding: 0, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="docker-table-container" style={{ flex: 1, overflowY: 'auto' }}>
          {activeTab === 'containers' ? (
            <table className="docker-table">
              <thead>
                <tr style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)' }}>
                  <th className="col-name">{t.docker.nameId}</th>
                  <th className="col-image desktop-only">{t.processes.user}</th>
                  <th className="col-mappings desktop-only">{t.docker.mappings}</th>
                  <th className="col-status desktop-only">{t.docker.serviceStatus}</th>
                  <th className="col-actions">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((c) => {
                  const isUp = c.Status.startsWith('Up');
                  return (
                    <tr key={c.ID} className="docker-row">
                      <td className="col-name">
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{c.Names}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{c.ID.substring(0, 12)}</div>
                        <div className="mobile-only" style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          <div onClick={() => (!isUp || c.Status.includes('Restarting')) && analyzeStatus(c)} style={{ cursor: !isUp || c.Status.includes('Restarting') ? 'pointer' : 'default' }}>
                            <span className={`badge ${isUp ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              {c.Status}
                              {(!isUp || c.Status.includes('Restarting')) && <Sparkles size={10} style={{ opacity: 0.8 }} />}
                            </span>
                          </div>
                          {c.Ports && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                              <Server size={10} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-header)' }}>{c.Ports}</div>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="col-image desktop-only">
                        <div style={{ fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.Image}</div>
                      </td>
                      <td className="col-mappings desktop-only">
                        {c.Ports && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.25rem' }}>
                            <Server size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-header)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.Ports}>{c.Ports}</div>
                          </div>
                        )}
                        {c.Mounts && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <HardDrive size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.Mounts}>{c.Mounts}</div>
                          </div>
                        )}
                      </td>
                      <td className="col-status desktop-only">
                        <span className={`badge ${isUp ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', cursor: !isUp || c.Status.includes('Restarting') ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }} onClick={() => (!isUp || c.Status.includes('Restarting')) && analyzeStatus(c)} title={c.Status}>
                          {c.Status}
                          {(!isUp || c.Status.includes('Restarting')) && <Sparkles size={10} style={{ opacity: 0.8 }} />}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="action-buttons">
                          {isUp ? (
                            <>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-warning)' }}
                                onClick={() => handleAction(c.ID, 'restart')} disabled={actionLoading === `${c.ID}-restart`} title={t.common.restart}
                              ><RotateCw size={14} className={actionLoading === `${c.ID}-restart` ? 'animate-spin' : ''} /></button>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-danger)' }}
                                onClick={() => handleAction(c.ID, 'stop')} disabled={actionLoading === `${c.ID}-stop`} title={t.common.stop}
                              ><Square size={14} /></button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-success)' }}
                                onClick={() => handleAction(c.ID, 'start')} disabled={actionLoading === `${c.ID}-start`} title={t.common.start}
                              ><Play size={14} /></button>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-text-muted)' }}
                                onClick={() => { if (window.confirm(t.common.deleteConfirm)) handleAction(c.ID, 'rm'); }} disabled={actionLoading === `${c.ID}-rm`} title={t.common.delete}
                              ><Trash2 size={14} /></button>
                            </>
                          )}
                          <button
                            className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-primary)' }}
                            onClick={() => showLogs(c.ID, c.Names)} title={t.docker.logs}
                          ><FileText size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <table className="docker-table">
              <thead>
                <tr style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)' }}>
                  <th className="col-name">{t.docker.repoTag}</th>
                  <th className="col-id desktop-only">ID</th>
                  <th className="col-size">{t.docker.size}</th>
                  <th className="col-status desktop-only">{t.docker.serviceStatus}</th>
                  <th className="col-actions">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img) => (
                  <tr key={img.ID} className="docker-row">
                    <td className="col-name">
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{img.Repository}</div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', alignItems: 'center' }}>
                        <span className="badge badge-warning" style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>{img.Tag}</span>
                        <div className="mobile-only">
                          <span className={`badge ${img.InUse ? 'badge-primary' : 'badge-ghost'}`} style={{ fontSize: '0.65rem', padding: '0.1rem 0.3rem' }}>
                            {img.InUse ? t.docker.inUse : t.docker.idle}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="col-id desktop-only">
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{img.ID.substring(0, 12)}</div>
                    </td>
                    <td className="col-size">
                      <div style={{ fontSize: '0.85rem' }}>{img.Size}</div>
                    </td>
                    <td className="col-status desktop-only">
                      <span className={`badge ${img.InUse ? 'badge-primary' : 'badge-ghost'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                        {img.InUse ? t.docker.inUse : t.docker.idle}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="action-buttons">
                        {!img.InUse && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-danger)' }}
                            onClick={() => { if (window.confirm(t.common.deleteConfirm)) handleAction(img.ID, 'rmi'); }} disabled={actionLoading === `${img.ID}-rmi`} title={t.common.delete}
                          ><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {((activeTab === 'containers' && containers.length === 0) || (activeTab === 'images' && images.length === 0)) && !loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>{t.common.none}</div>
        )}
      </div>

      {isLogsOpen && (
        <div className="menu-backdrop" onClick={() => setIsLogsOpen(false)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div className="card glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '900px', height: '80vh', display: 'flex', flexDirection: 'column', margin: 'auto' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--color-surface-border)', padding: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{t.docker.logs}</h2>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.08)', borderRadius: '6px', fontSize: '0.8rem', height: '28px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                  onClick={() => {
                    const container = containers.find(c => c.ID === diagnosisId);
                    if (container) analyzeLogs(container.ID, container.Names);
                  }}
                  disabled={isAiAnalyzing || logsLoading}
                >
                  <Sparkles size={14} className={isAiAnalyzing ? 'animate-pulse' : ''} />
                  {isAiAnalyzing ? t.docker.aiAnalyzingStatus : t.common.aiAudit}
                </button>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsLogsOpen(false)}>{t.common.close}</button>
            </div>

            {analysisResult && (
              <div className="ai-output-block" style={{
                margin: 0,
                background: 'rgba(59, 130, 246, 0.03)',
                borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
                animation: 'slideInDown 0.3s ease',
                maxHeight: '250px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.6rem 1.25rem',
                  color: 'var(--color-primary)',
                  position: 'sticky',
                  top: 0,
                  background: 'rgba(240, 247, 255, 0.98)',
                  backdropFilter: 'blur(8px)',
                  zIndex: 5,
                  borderBottom: '1px solid rgba(59, 130, 246, 0.05)'
                }}>
                  <Brain size={16} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.docker.aiContainerDiagnosis}</span>
                  <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text)', lineHeight: 1.6, padding: '1rem 1.25rem', overflowY: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                  {analysisResult.includes(t.common.errors.aiConfigMissing) && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div
              ref={logRef}
              style={{
                fontFamily: 'monospace', padding: '1rem', overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem',
                lineHeight: '1.6', border: '1px solid var(--color-surface-border)',
                background: 'var(--color-surface-bg)', color: 'var(--color-text)',
                borderRadius: '0 0 var(--radius-sm) var(--radius-sm)'
              }}
            >
              {logsLoading ? (
                <div className="flex-center" style={{ height: '100%', gap: '0.5rem' }}>
                  <RotateCw className="animate-spin" size={20} />
                  <span>{t.common.loading}...</span>
                </div>
              ) : currentLogs}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .docker-table-container {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .docker-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          min-width: 600px;
        }
        .docker-table th, .docker-table td {
          padding: 1rem;
          text-align: left;
          font-size: 0.9rem;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .docker-table th {
          position: sticky;
          top: 0;
          z-index: 10;
          background: var(--color-bg);
          box-shadow: inset 0 -1px 0 var(--color-surface-border);
        }
        .docker-table td.col-status {
          overflow: visible;
        }
        .col-name { width: auto; }
        .col-image { width: 140px; }
        .col-mappings { width: 180px; }
        .col-id { width: 120px; font-family: monospace; }
        .col-status { width: 160px; }
        .col-size { width: 100px; }
        .col-actions { width: 160px; text-align: right; }
        .col-actions .action-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 0.4rem;
        }
        .btn-icon {
          border: 1px solid rgba(0,0,0,0.1);
          padding: 0.4rem;
        }
        .docker-row {
          border-bottom: 1px solid rgba(0,0,0,0.03);
          transition: background 0.2s;
        }
        .docker-row:hover {
          background: rgba(59, 130, 246, 0.02);
        }

        @media (max-width: 768px) {
          .docker-table {
            min-width: 100%;
            table-layout: auto;
          }
          .col-id, .col-image.desktop-only, .col-mappings.desktop-only {
            display: none;
          }
          .docker-table th, .docker-table td {
            padding: 0.75rem 0.5rem;
          }
          .col-status { width: 90px; }
          .col-actions { width: 120px; }
          .col-size { width: 70px; }
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
