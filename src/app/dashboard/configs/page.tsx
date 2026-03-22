"use client";

import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Settings, FileText, ChevronLeft, RefreshCw, Sparkles, Search, X, Save, Brain, Plus, MinusCircle } from 'lucide-react';

interface ConfigItem {
  id: string;
  name: string;
  path: string;
  type: 'system' | 'user';
  category: string;
  size?: number;
  mtime?: number;
  isCustom?: boolean;
}

export default function ConfigsDashboard() {
  const { t } = useLanguage();

  const formatSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatAbsoluteTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const i = String(date.getMinutes()).padStart(2, '0');
    return `${m}-${d} ${h}:${i}`;
  };
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [readLoading, setReadLoading] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  // aiCacheRef removed as unused
  const [searchQuery, setSearchQuery] = useState('');
  const [homePath, setHomePath] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [addModal, setAddModal] = useState({ isOpen: false, path: '', loading: false });
  const addInputRef = useRef<HTMLInputElement>(null);

  const configCategories = [
    { id: 'all', label: t.configs.categories.all },
    { id: 'Shell & CLI', label: t.configs.categories.shell },
    { id: 'Web Server', label: t.configs.categories.web },
    { id: 'Database', label: t.configs.categories.db },
    { id: 'Dev Tools', label: t.configs.categories.dev },
    { id: 'System', label: t.configs.categories.sys }
  ];

  const openConfig = useCallback(async (config: ConfigItem) => {
    setEditingId(config.id);
    setReadLoading(true);
    setAnalysisResult('');
    setShowAiPanel(false);
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', id: config.id }),
      });
      const data = await res.json();
      if (data.success) {
        setContent(data.content || '');
      }
    } catch (e) {
      console.error(e);
      setContent(t.common.fetchFailed);
    } finally {
      setReadLoading(false);
    }
  }, [t.common.fetchFailed]);

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/configs');
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data || []);
        if (data.home) setHomePath(data.home);

        // Auto-select first one on big screens if none selected
        if (data.data && data.data.length > 0 && !editingId && typeof window !== 'undefined' && window.innerWidth > 768) {
          openConfig(data.data[0]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [editingId, openConfig]);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  const handleSave = async () => {
    if (!editingId) return;

    setSaveStatus(t.common.saving);
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', id: editingId, content }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus(t.common.saveSuccess);
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus(t.common.saveFailed);
      }
    } catch {
      setSaveStatus(t.common.networkError);
    }
  };

  const handleAiAction = async () => {
    const config = configs.find(c => c.id === editingId);
    if (!config) return;

    setIsAiAnalyzing(true);
    setShowAiPanel(true);
    setAnalysisResult('');

    try {
      const prompt = t.configs.aiAnalyzePrompt.replace('{name}', config.name).replace('{content}', content);

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      }
    } catch (e) {
      console.error(e);
      setAnalysisResult('Analysis failed. Please try again.');
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const handleAddConfig = async () => {
    if (!addModal.path) return;
    setAddModal(prev => ({ ...prev, loading: true }));
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: addModal.path, action: 'add' })
      });
      const data = await res.json();
      if (data.success) {
        setAddModal({ isOpen: false, path: '', loading: false });
        fetchConfigs();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAddModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleRemoveConfig = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (!confirm(t.configs.removeConfirm)) return;
    
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: path, action: 'remove' })
      });
      const data = await res.json();
      if (data.success) {
        fetchConfigs();
        if (editingId === path) {
          setEditingId(null);
          setContent('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const filteredConfigs = configs.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.path.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || c.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const activeConfig = configs.find(c => c.id === editingId);

  if (loading && configs.length === 0) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="page-shell grid no-scrollbar animate-fade-in" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Settings size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.sidebar.configs}</h1>
        </div>
        <button className="btn btn-ghost" style={{ padding: '0.6rem 1rem', border: '1px solid var(--color-surface-border)' }} onClick={fetchConfigs}>
          <RefreshCw size={16} style={{ marginRight: '8px' }} />
          {t.common.refresh}
        </button>
      </div>

      <div className={`responsive-grid ${editingId ? 'showing-content' : 'showing-list'}`}>
        <div className="configs-sidebar card glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input
              type="text"
              className="input"
              placeholder={t.configs.searchPlaceholder}
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
              title={t.configs.addFile}
            >
              <Plus size={16} color="var(--color-primary)" />
            </button>
          </div>

          <div className="no-scrollbar" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1rem', paddingBottom: '0.5rem', minWidth: 0 }}>
            {configCategories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '100px',
                  fontSize: '0.75rem',
                  whiteSpace: 'nowrap',
                  border: '1px solid',
                  borderColor: activeCategory === cat.id ? 'var(--color-primary)' : 'transparent',
                  background: activeCategory === cat.id ? 'var(--color-primary-light)' : 'var(--color-surface-bg)',
                  color: activeCategory === cat.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  cursor: 'pointer',
                  fontWeight: activeCategory === cat.id ? 600 : 400,
                  transition: 'all 0.2s'
                }}
              >
                {cat.label} ({cat.id === 'all' ? configs.length : configs.filter(c => c.category === cat.id).length})
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredConfigs.map(config => (
                <li
                  key={config.id}
                  className={`config-item ${editingId === config.id ? 'active' : ''}`}
                  onClick={() => openConfig(config)}
                  style={{
                    padding: '0.85rem',
                    marginBottom: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: editingId === config.id ? 'var(--color-primary-light)' : 'var(--color-surface-bg)',
                    border: editingId === config.id ? '1px solid rgba(59,130,246,0.2)' : '1px solid var(--color-surface-border)',
                    transition: 'all 0.2s',
                    minWidth: 0,
                    overflow: 'hidden'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem', minWidth: 0 }}>
                    <FileText size={14} style={{ flexShrink: 0 }} color={editingId === config.id ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: editingId === config.id ? 'var(--color-primary)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{config.name}</span>
                    {config.isCustom && (
                      <button
                        onClick={(e) => handleRemoveConfig(e, config.path)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
                        title={t.common.delete}
                      >
                        <MinusCircle size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.8, marginBottom: '0.35rem', fontFamily: 'monospace' }}>
                    {config.path.length > 35 ? '...' + config.path.slice(-32) : config.path.replace(homePath, '~')}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 500, opacity: 0.7 }}>
                    <span>{formatSize(config.size)}</span>
                    <span>{formatAbsoluteTime(config.mtime)}</span>
                  </div>
                </li>
              ))}
              {filteredConfigs.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{t.common.none}</div>
              )}
            </ul>
          </div>
        </div>

        <div className="configs-content card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)', padding: 0, overflow: 'hidden' }}>
          {activeConfig ? (
            <>
              <div className="flex-between" style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)', background: 'var(--color-surface-bg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, overflow: 'hidden' }}>
                  <button className="btn btn-ghost mobile-only" onClick={() => setEditingId(null)}><ChevronLeft size={20} /></button>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{activeConfig.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', background: 'var(--color-primary-light)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 500 }}>
                        {formatSize(activeConfig.size)} · {formatAbsoluteTime(activeConfig.mtime)}
                      </div>
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden', opacity: 0.6 }}>{activeConfig.path.replace(homePath, '~')}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', height: '32px', gap: '6px' }} onClick={() => handleAiAction()} disabled={isAiAnalyzing}>
                    <Sparkles size={15} className={isAiAnalyzing ? 'animate-pulse' : ''} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{isAiAnalyzing ? t.common.analyzing : t.common.analyze}</span>
                  </button>
                  <button className="btn btn-primary btn-sm" style={{ height: '32px' }} onClick={handleSave}>
                    <Save size={14} style={{ marginRight: '6px' }} /> {t.common.save}
                  </button>
                </div>
              </div>

              {showAiPanel && (
                <div className="ai-panel" style={{ background: 'var(--color-primary-light)', opacity: 0.95, borderBottom: '1px solid var(--color-surface-border)', maxHeight: '350px', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', background: 'var(--color-surface-bg)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 1 }}>
                    <Brain size={16} color="var(--color-primary)" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.configs.aiAnalyzeTitle}</span>
                    <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }} onClick={() => setShowAiPanel(false)}><X size={16} color="var(--color-text-muted)" /></button>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {isAiAnalyzing ? (
                      <div className="flex-center" style={{ padding: '2rem', flexDirection: 'column', gap: '1rem' }}>
                        <div className="animate-spin" style={{ width: '24px', height: '24px', border: '3px solid var(--color-primary-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%' }}></div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{t.common.analyzing}</span>
                      </div>
                    ) : (
                      <div className="markdown-content" style={{ fontSize: '0.85rem', lineHeight: 1.6 }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                        {analysisResult.includes(t.common.errors.aiConfigMissing) && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '1.5rem', background: 'var(--color-surface-bg)' }}>
                {readLoading ? (
                  <div className="flex-center" style={{ height: '100%' }}>{t.common.loading}</div>
                ) : (
                  <textarea
                    className="no-scrollbar"
                    style={{
                      width: '100%', height: '100%', border: 'none', outline: 'none',
                      background: 'transparent', fontFamily: 'monospace', fontSize: '0.85rem',
                      resize: 'none', color: 'var(--color-text)', lineHeight: 1.6
                    }}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    spellCheck={false}
                  />
                )}
              </div>

              <div style={{ padding: '0.5rem 1rem', background: 'var(--color-surface-bg)', borderTop: '1px solid var(--color-surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', visibility: saveStatus ? 'visible' : 'hidden' }}>{saveStatus}</span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', opacity: 0.6 }}>UTF-8 Plain Text</span>
              </div>
            </>
          ) : (
            <div className="flex-center" style={{ flex: 1, flexDirection: 'column', color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem' }}>
              <Settings size={64} style={{ marginBottom: '1.5rem', opacity: 0.1, strokeWidth: 1 }} />
              <p style={{ fontSize: '0.9rem', maxWidth: '300px' }}>{t.configs.selectConfig}</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .responsive-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) 3fr; gap: 1.5rem; align-items: start; width: 100%; max-width: 100%; box-sizing: border-box; }
        .config-item:hover { background: rgba(59, 130, 246, 0.05) !important; }
        
        .mobile-only { display: none; }
        .desktop-only { display: flex; }

        @media (max-width: 768px) {
          .page-shell { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
          .responsive-grid { flex: 1 !important; min-height: 0; display: flex !important; flex-direction: column; height: auto !important; width: 100%; max-width: 100%; overflow-x: hidden; }
          .showing-content .configs-sidebar { display: none !important; }
          .showing-list .configs-content { display: none !important; }
          .mobile-only { display: flex !important; }
          .desktop-only { display: none !important; }
          .configs-sidebar, .configs-content {
            flex: 1 !important;
            min-height: 0;
            height: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
        }
      `}</style>
      {/* Add Config Modal */}
      {addModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
          <div className="card glass-panel" style={{ padding: '1.5rem', maxWidth: '450px', width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: '8px' }}>
                <Plus size={20} color="var(--color-primary)" />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.configs.addFile}</div>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: '0.5rem' }}>{t.configs.addFilePath}</label>
              <div style={{ position: 'relative' }}>
                <input
                  ref={addInputRef}
                  type="text"
                  className="input"
                  placeholder={t.configs.addFilePlaceholder}
                  style={{ paddingRight: addModal.path ? '2.5rem' : '0.75rem' }}
                  value={addModal.path}
                  onChange={(e) => setAddModal(prev => ({ ...prev, path: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddConfig()}
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
                onClick={handleAddConfig}
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
