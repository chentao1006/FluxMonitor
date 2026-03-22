"use client";

import Link from 'next/link';
import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Activity, FileText, ChevronLeft, RefreshCw, Search, X, Sparkles, Brain, Trash2, Eraser, Lock, Plus, MinusCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LogFile {
  name: string;
  path: string;
  size: number;
  category: string;
  mtime: number;
  isCustom?: boolean;
}

type ActionType = 'clear' | 'delete';

interface SudoModalState {
  isOpen: boolean;
  filePath: string;
  action: ActionType;
  password: string;
  loading: boolean;
  error: string;
}

export default function LogsPage() {
  const { t } = useLanguage();
  const [files, setFiles] = useState<LogFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [readLoading, setReadLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [actionLoadingPath, setActionLoadingPath] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; filePath: string; action: ActionType } | null>(null);
  const [sudoModal, setSudoModal] = useState<SudoModalState>({
    isOpen: false, filePath: '', action: 'clear', password: '', loading: false, error: ''
  });
  const [addModal, setAddModal] = useState({ isOpen: false, path: '', loading: false });
  const sudoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const addInputRef = useRef<HTMLInputElement>(null);

  const internalCategories = ['all', 'system', 'service', 'app', 'other'];
  const categoryLabels: Record<string, string> = {
    all: t.logs.all,
    system: t.logs.system,
    service: t.logs.service,
    app: t.logs.app,
    other: t.logs.other
  };

  const formatSize = (bytes: any) => {
    const b = parseInt(bytes);
    if (isNaN(b) || b === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatAbsoluteTime = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const i = String(date.getMinutes()).padStart(2, '0');
    return `${m}-${d} ${h}:${i}`;
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        setFiles(data.data);
        // Auto-select first one on big screens if none selected
        if (data.data && data.data.length > 0 && !activeFile && typeof window !== 'undefined' && window.innerWidth > 768) {
          openLog(data.data[0].path);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  // 每次日志内容更新后，自动滚动 textarea 到最底部
  useEffect(() => {
    if (!readLoading && content && textareaRef.current) {
      textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
    }
  }, [content, readLoading]);

  const openLog = async (path: string) => {
    setActiveFile(path);
    setReadLoading(true);
    setAnalysisResult('');
    try {
      const res = await fetch(`/api/logs?file=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.success) {
        setContent(data.data);
      } else {
        setContent(t.common.fetchFailed);
      }
    } catch (e) {
      setContent(t.common.networkError);
    } finally {
      setReadLoading(false);
    }
  };

  const handleExplain = async () => {
    if (!content || isExplaining) return;
    setIsExplaining(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.logs.explainPrompt.replace('{content}', content)
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      } else {
        const errorMsg = (t.common.errors as Record<string, string>)[data.error] || data.details || data.error;
        setAnalysisResult(errorMsg);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsExplaining(false);
    }
  };

  // Execute clear/delete action
  const executeAction = async (filePath: string, action: ActionType, password?: string) => {
    setActionLoadingPath(filePath);
    try {
      const body: any = { file: filePath, action };
      if (password) body.password = password;

      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (data.requiresPassword) {
        // Need sudo password
        setSudoModal({ isOpen: true, filePath, action, password: '', loading: false, error: '' });
        setTimeout(() => sudoInputRef.current?.focus(), 100);
        return;
      }

      if (!data.success) {
        if (res.status === 401) {
          setSudoModal(prev => ({ ...prev, error: t.common.actionFailed, loading: false }));
        }
        return;
      }

      // Success
      if (action === 'delete') {
        // Remove from list, clear viewer if this was active
        setFiles(prev => prev.filter(f => f.path !== filePath));
        if (activeFile === filePath) {
          setActiveFile(null);
          setContent('');
        }
      } else if (action === 'clear') {
        // Reload file content if viewing it
        if (activeFile === filePath) {
          setContent('');
        }
        // Refresh file list to update size
        fetchFiles();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoadingPath(null);
    }
  };

  // Confirm modal handler
  const handleActionClick = (e: React.MouseEvent, filePath: string, action: ActionType) => {
    e.stopPropagation();
    setConfirmModal({ isOpen: true, filePath, action });
  };

  const handleConfirm = async () => {
    if (!confirmModal) return;
    const { filePath, action } = confirmModal;
    setConfirmModal(null);
    await executeAction(filePath, action);
  };

  const handleSudoSubmit = async () => {
    setSudoModal(prev => ({ ...prev, loading: true, error: '' }));
    const { filePath, action, password } = sudoModal;
    setSudoModal(prev => ({ ...prev, isOpen: false }));
    await executeAction(filePath, action, password);
  };

  const handleAddFile = async () => {
    if (!addModal.path) return;
    setAddModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: addModal.path, action: 'add' })
      });
      const data = await res.json();
      if (data.success) {
        setAddModal({ isOpen: false, path: '', loading: false });
        fetchFiles();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleRemoveFile = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (!confirm(t.logs.removeConfirm)) return;
    
    setActionLoadingPath(path);
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: path, action: 'remove' })
      });
      const data = await res.json();
      if (data.success) {
        fetchFiles();
        if (activeFile === path) {
          setActiveFile(null);
          setContent('');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setActionLoadingPath(null);
    }
  };

  const filteredFiles = files.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.path.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || f.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const currentFile = files.find(f => f.path === activeFile);

  if (loading && files.length === 0) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="page-shell grid no-scrollbar animate-fade-in" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Activity size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.sidebar.logs}</h1>
        </div>
        <button className="btn btn-ghost" style={{ padding: '0.6rem 1rem', border: '1px solid var(--color-surface-border)' }} onClick={fetchFiles}>
          <RefreshCw size={16} style={{ marginRight: '8px' }} />
          {t.common.refresh}
        </button>
      </div>

      <div className={`logs-layout ${activeFile ? 'showing-content' : 'showing-list'}`}>
        <div className="logs-sidebar card glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder={t.logs.searchLogs}
              style={{ paddingLeft: '2.5rem', paddingRight: searchQuery ? '2.5rem' : '0.75rem', fontSize: '0.85rem' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '2.5rem',
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
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => {
                setAddModal({ isOpen: true, path: '', loading: false });
                setTimeout(() => addInputRef.current?.focus(), 100);
              }}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', padding: '0.25rem', height: 'auto' }}
              title={t.logs.addFile}
            >
              <Plus size={16} color="var(--color-primary)" />
            </button>
          </div>

          <div className="no-scrollbar" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
            {internalCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '100px',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  border: '1px solid',
                  borderColor: activeCategory === cat ? 'var(--color-primary)' : 'transparent',
                  background: activeCategory === cat ? 'var(--color-primary-light)' : 'var(--color-surface-bg)',
                  color: activeCategory === cat ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontWeight: activeCategory === cat ? 600 : 400,
                  transition: 'all 0.2s'
                }}
              >
                {categoryLabels[cat]} ({cat === 'all' ? files.length : files.filter(f => f.category === cat).length})
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredFiles.map(file => {
                const isActive = activeFile === file.path;
                const isActioning = actionLoadingPath === file.path;
                return (
                  <li
                    key={file.path}
                    className={`log-item ${isActive ? 'active' : ''}`}
                    onClick={() => openLog(file.path)}
                    style={{
                      padding: '0.85rem',
                      marginBottom: '0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      background: isActive ? 'var(--color-primary-light)' : 'var(--color-surface-bg)',
                      border: isActive ? '1px solid rgba(59,130,246,0.2)' : '1px solid transparent',
                      transition: 'all 0.2s',
                      minWidth: 0,
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', minWidth: 0 }}>
                      <FileText size={14} style={{ flexShrink: 0 }} color={isActive ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: isActive ? 'var(--color-primary)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{file.name}</span>
                      {/* Action buttons - hover visible */}
                      <div
                        className="log-actions"
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}
                      >
                        <button
                          className="log-action-btn"
                          title={t.common.clear}
                          disabled={isActioning}
                          onClick={(e) => handleActionClick(e, file.path, 'clear')}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.2rem',
                            borderRadius: '4px',
                            color: 'var(--color-text-muted)',
                            transition: 'color 0.15s, background 0.15s',
                            opacity: isActioning ? 0.4 : 1,
                            display: 'flex', alignItems: 'center'
                          }}
                        >
                          <Eraser size={13} />
                        </button>
                        <button
                          className="log-action-btn log-action-btn-danger"
                          title={file.isCustom ? t.common.confirm : t.common.delete}
                          disabled={isActioning}
                          onClick={(e) => file.isCustom ? handleRemoveFile(e, file.path) : handleActionClick(e, file.path, 'delete')}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0.2rem',
                            borderRadius: '4px',
                            color: 'var(--color-text-muted)',
                            transition: 'color 0.15s, background 0.15s',
                            opacity: isActioning ? 0.4 : 1,
                            display: 'flex', alignItems: 'center'
                          }}
                        >
                          {file.isCustom ? <MinusCircle size={13} /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8, marginBottom: '0.35rem', fontFamily: 'monospace' }}>
                      {file.path.length > 40 ? '...' + file.path.slice(-37) : file.path}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 500, opacity: 0.7 }}>
                      <span>{formatSize(file.size || 0)}</span>
                      <span>{formatAbsoluteTime(file.mtime || 0)}</span>
                    </div>
                    {isActioning && (
                      <div style={{ position: 'absolute', inset: 0, background: 'var(--color-surface-bg)', opacity: 0.8, borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)' }}>{t.common.loading}</span>
                      </div>
                    )}
                  </li>
                );
              })}
              {filteredFiles.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{t.common.none}</div>
              )}
            </ul>
          </div>
        </div>

        <div className="logs-viewer card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', padding: 0, overflow: 'hidden' }}>
          {activeFile && currentFile ? (
            <>
              <div className="flex-between" style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)', background: 'var(--color-surface-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                  <button className="btn btn-ghost mobile-only" onClick={() => setActiveFile(null)}><ChevronLeft size={20} /></button>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{currentFile.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', background: 'var(--color-primary-light)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 500 }}>
                        {formatSize(currentFile.size)} · {formatAbsoluteTime(currentFile.mtime)}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.6 }}>{currentFile.path}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', height: '32px', gap: '6px' }} onClick={handleExplain} disabled={isExplaining}>
                    <Sparkles size={15} className={isExplaining ? 'animate-pulse' : ''} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{isExplaining ? t.common.analyzing : t.common.analyze}</span>
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title={t.common.clear}
                    style={{ color: 'var(--color-warning, #f59e0b)', background: 'rgba(245,158,11,0.08)', height: '32px', padding: '0 0.7rem' }}
                    onClick={(e) => handleActionClick(e, currentFile.path, 'clear')}
                    disabled={!!actionLoadingPath}
                  >
                    <Eraser size={15} />
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title={t.common.delete}
                    style={{ color: '#ef4444', background: 'rgba(239,68,68,0.08)', height: '32px', padding: '0 0.7rem' }}
                    onClick={(e) => handleActionClick(e, currentFile.path, 'delete')}
                    disabled={!!actionLoadingPath}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {analysisResult && (
                <div className="ai-panel" style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)', maxHeight: '350px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-bg)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <Brain size={16} color="var(--color-primary)" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>AI {t.logs.analyzeTitle}</span>
                    <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setAnalysisResult('')}><X size={14} /></button>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', fontSize: '0.85rem', lineHeight: 1.6 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                    {analysisResult.includes(t.common.errors.aiConfigMissing) && (
                      <div style={{ marginTop: '0.75rem' }}>
                        <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, padding: '1.5rem', background: 'var(--color-surface-bg)', overflow: 'hidden' }}>
                {readLoading ? (
                  <div className="flex-center" style={{ height: '100%' }}>{t.common.loading}</div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    readOnly
                    className="no-scrollbar"
                    style={{
                      width: '100%', height: '100%', border: 'none', outline: 'none',
                      background: 'transparent', fontFamily: 'monospace', fontSize: '0.85rem',
                      resize: 'none', color: 'var(--color-text)', lineHeight: 1.6
                    }}
                    value={content}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex-center" style={{ flex: 1, flexDirection: 'column', color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>
              <Activity size={64} style={{ marginBottom: '1.5rem', opacity: 0.1, strokeWidth: 1 }} />
              <p style={{ fontSize: '0.9rem', maxWidth: '300px' }}>{t.logs.noFileLeft}</p>
            </div>
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmModal?.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card glass-panel" style={{ padding: '1.5rem', maxWidth: '380px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              {confirmModal.action === 'delete' ? (
                <div style={{ background: 'rgba(239,68,68,0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Trash2 size={20} color="#ef4444" />
                </div>
              ) : (
                <div style={{ background: 'rgba(245,158,11,0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Eraser size={20} color="#f59e0b" />
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                  {confirmModal.action === 'delete' ? t.common.delete : t.common.clear}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
                  {files.find(f => f.path === confirmModal.filePath)?.name}
                </div>
              </div>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              {confirmModal.action === 'delete' ? t.common.deleteConfirm : t.logs.clearConfirm}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmModal(null)}>{t.common.cancel}</button>
              <button
                className="btn"
                style={{ background: confirmModal.action === 'delete' ? '#ef4444' : '#f59e0b', color: '#fff', border: 'none' }}
                onClick={handleConfirm}
              >
                {confirmModal.action === 'delete' ? t.common.delete : t.common.clear}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sudo Password Modal */}
      {sudoModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card glass-panel" style={{ padding: '1.5rem', maxWidth: '380px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(99,102,241,0.1)', padding: '0.5rem', borderRadius: '8px' }}>
                <Lock size={20} color="#6366f1" />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.logs.requireSudo}</div>
            </div>
            {sudoModal.error && (
              <div style={{ padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: '6px', color: '#ef4444', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                {sudoModal.error}
              </div>
            )}
            <input
              ref={sudoInputRef}
              type="password"
              className="input"
              placeholder="••••••••"
              value={sudoModal.password}
              onChange={(e) => setSudoModal(prev => ({ ...prev, password: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSudoSubmit()}
              style={{ marginBottom: '1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setSudoModal(prev => ({ ...prev, isOpen: false }))}>{t.common.cancel}</button>
              <button
                className="btn"
                style={{ background: 'var(--color-primary)', color: '#fff', border: 'none' }}
                disabled={sudoModal.loading || !sudoModal.password}
                onClick={handleSudoSubmit}
              >
                {sudoModal.loading ? t.common.loading : t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .logs-layout { display: grid; grid-template-columns: minmax(0, 1.4fr) 3fr; gap: 1.5rem; align-items: start; width: 100%; max-width: 100%; box-sizing: border-box; }
        .log-item:hover { background: rgba(59, 130, 246, 0.05) !important; }
        .log-item .log-actions { opacity: 0; transition: opacity 0.15s; }
        .log-item:hover .log-actions { opacity: 1; }
        .log-item.active .log-actions { opacity: 1; }
        .log-action-btn:hover { color: var(--color-primary) !important; background: rgba(59,130,246,0.1) !important; }
        .log-action-btn-danger:hover { color: #ef4444 !important; background: rgba(239,68,68,0.1) !important; }

        .mobile-only { display: none; }
        .desktop-only { display: flex; }

        @media (max-width: 768px) {
          .page-shell { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
          .logs-layout { flex: 1 !important; min-height: 0; display: flex !important; flex-direction: column; height: auto !important; width: 100%; max-width: 100%; overflow-x: hidden; }
          .showing-content .logs-sidebar { display: none !important; }
          .showing-list .logs-viewer { display: none !important; }
          .mobile-only { display: flex !important; }
          .desktop-only { display: none !important; }
          .logs-sidebar, .logs-viewer {
            flex: 1 !important;
            min-height: 0;
            height: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
          .log-item .log-actions { opacity: 1; }
        }
      `}</style>
      {/* Add File Modal */}
      {addModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="modal-content" style={{ background: 'var(--color-bg)', padding: '1.5rem', maxWidth: '450px', width: '90%', boxShadow: '0 20px 60px var(--color-shadow)', border: '1px solid var(--color-surface-border)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: '8px' }}>
                <Plus size={20} color="var(--color-primary)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.logs.addFile}</div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.5rem' }}>{t.logs.addFilePath}</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={addInputRef}
                  type="text"
                  className="input"
                  placeholder={t.logs.addFilePlaceholder}
                  style={{ paddingRight: addModal.path ? '2.5rem' : '0.75rem' }}
                  value={addModal.path}
                  onChange={(e) => setAddModal(prev => ({ ...prev, path: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddFile()}
                />
                {addModal.path && (
                  <button
                    onClick={() => setAddModal(prev => ({ ...prev, path: '' }))}
                    style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setAddModal(prev => ({ ...prev, isOpen: false }))}>{t.common.cancel}</button>
              <button
                className="btn btn-primary"
                disabled={addModal.loading || !addModal.path}
                onClick={handleAddFile}
              >
                {addModal.loading ? t.common.loading : t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
