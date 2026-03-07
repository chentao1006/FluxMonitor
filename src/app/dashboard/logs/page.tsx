"use client";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { RefreshCw, Trash2, FileText, ChevronRight, Search, Eraser, ArrowLeft, Sparkles, Brain } from 'lucide-react';

export default function LogsPage() {
  const { t, language, effectiveLang } = useLanguage();
  const [files, setFiles] = useState<any[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);
  const [logExplanation, setLogExplanation] = useState('');
  const [isExplaining, setIsExplaining] = useState(false);
  const aiCacheRef = useRef<Record<string, string>>({});

  const [activeCategory, setActiveCategory] = useState<string>('all');

  const internalCategories = ['all', 'system', 'service', 'app', 'other'];
  const categoryLabels: Record<string, string> = {
    all: t.logs.all,
    system: t.logs.system,
    service: t.logs.service,
    app: t.logs.app,
    other: t.logs.other
  };

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        setFiles(data.data);
        if (data.data.length > 0 && !activeFile && typeof window !== 'undefined' && window.innerWidth > 768) {
          setActiveFile(data.data[0].path);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchContent = async (path: string) => {
    setContentLoading(true);
    try {
      const res = await fetch(`/api/logs?file=${encodeURIComponent(path)}`);
      const data = await res.json();
      if (data.success) {
        setContent(data.data);
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }, 100);
      } else {
        setContent(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setContent(t.common.loading + ' failed');
    } finally {
      setContentLoading(false);
    }
  };

  const clearLog = async (targetFile?: string, password?: string) => {
    const fileToClear = targetFile || activeFile;
    if (!fileToClear) return;
    if (!password && !window.confirm(`${t.logs.clearConfirm} ${fileToClear.split('/').pop()}`)) return;

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', file: fileToClear, password })
      });
      const data = await res.json();
      if (data.success) {
        if (fileToClear === activeFile) setContent('');
        fetchFiles();
      } else if (data.requiresPassword) {
        const pass = window.prompt(t.logs.requireSudo);
        if (pass) clearLog(fileToClear, pass);
      } else {
        alert(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    }
  };

  const deleteFile = async (targetFile?: string, password?: string) => {
    const fileToDelete = targetFile || activeFile;
    if (!fileToDelete) return;
    if (!password && !window.confirm(t.common.deleteConfirm)) return;

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', file: fileToDelete, password })
      });
      const data = await res.json();
      if (data.success) {
        if (fileToDelete === activeFile) {
          setActiveFile(null);
          setContent('');
        }
        fetchFiles();
      } else if (data.requiresPassword) {
        const pass = window.prompt(t.logs.requireSudo);
        if (pass) deleteFile(fileToDelete, pass);
      } else {
        alert(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    }
  };

  const explainLog = async () => {
    if (!content || contentLoading || !activeFile) return;

    if (logExplanation) {
      setLogExplanation('');
      return;
    }

    const cacheKey = `${activeFile}:${content.slice(-2000)}`;
    if (aiCacheRef.current[cacheKey]) {
      setLogExplanation(aiCacheRef.current[cacheKey]);
      return;
    }

    setIsExplaining(true);
    setLogExplanation(t.logs.aiProcess);
    try {
      const prompt = t.logs.aiPrompt
        .replace('{filename}', activeFile.split('/').pop() || '')
        .replace('{content}', content.slice(-4000));

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          systemPrompt: 'You are an expert system administrator and software engineer specializing in macOS and Linux system logs.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setLogExplanation(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else {
        setLogExplanation(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setLogExplanation(t.common.networkError);
    } finally {
      setIsExplaining(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (activeFile) {
      fetchContent(activeFile);
      setLogExplanation('');
    }
  }, [activeFile]);

  useEffect(() => {
    if (content && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [content]);

  useEffect(() => {
    const filtered = files.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.path.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'all' || f.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
    setFilteredFiles(filtered);
  }, [searchTerm, files, activeCategory]);

  if (loading && files.length === 0) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid animate-fade-in">
      <div className="flex-between logs-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <FileText size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title log-title" style={{ margin: 0, fontSize: '1.5rem' }}>{t.logs.title}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={fetchFiles} title={t.common.refresh}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className={`logs-layout ${activeFile ? 'showing-content' : 'showing-list'}`}>
        <div className="logs-sidebar card glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input"
                placeholder={t.common.search}
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.5rem', fontSize: '0.9rem', width: '100%' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            </div>

            <div style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
              {internalCategories.map((cat, idx) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    padding: '0.4rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    border: '1px solid',
                    borderColor: activeCategory === cat ? 'var(--color-primary)' : 'transparent',
                    background: activeCategory === cat ? 'var(--color-primary-light)' : 'rgba(0,0,0,0.05)',
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
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {filteredFiles.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                {t.common.none}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[...filteredFiles]
                  .sort((a, b) => b.mtime - a.mtime)
                  .map((file) => (
                    <div
                      key={file.path}
                      onClick={() => setActiveFile(file.path)}
                      className={`log-tab ${activeFile === file.path ? 'active' : ''}`}
                      style={{
                        padding: '0.85rem 1rem',
                        cursor: 'pointer',
                        borderRadius: 'var(--radius-sm)',
                        marginBottom: '0.25rem',
                        transition: 'all 0.2s',
                        background: activeFile === file.path ? 'var(--color-primary-light)' : 'transparent',
                        color: activeFile === file.path ? 'var(--color-primary)' : 'inherit',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        fontSize: '0.85rem',
                        border: activeFile === file.path ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid transparent'
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, gap: '0.15rem' }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: activeFile === file.path ? 600 : 400, fontSize: '0.9rem' }}>
                          {file.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.dir}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', opacity: activeFile === file.path ? 1 : 0.6, display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span>{(file.size / 1024).toFixed(1)} KB</span>
                            <span>•</span>
                            <span>{new Date(file.mtime).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>

                          <div className="log-item-actions" style={{ display: 'flex', gap: '0.15rem', opacity: 0, transition: 'opacity 0.2s' }}>
                            <button
                              className="btn btn-ghost"
                              onClick={(e) => { e.stopPropagation(); clearLog(file.path); }}
                              style={{ padding: '0.15rem', color: 'var(--color-warning)', minHeight: 'auto', background: 'transparent' }}
                              title={t.common.clear}
                            >
                              <Eraser size={12} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={(e) => { e.stopPropagation(); deleteFile(file.path); }}
                              style={{ padding: '0.15rem', color: 'var(--color-danger)', minHeight: 'auto', background: 'transparent' }}
                              title={t.common.delete}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                      {activeFile === file.path && <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.5 }} />}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="logs-content card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', padding: 0, overflow: 'hidden' }}>
          <div className="flex-between" style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)', background: 'rgba(255,255,255,0.3)', flexWrap: 'nowrap' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
              <button
                className="btn btn-ghost mobile-back-btn"
                onClick={() => setActiveFile(null)}
                style={{ padding: '0.4rem', borderRadius: 'var(--radius-sm)' }}
                title={t.common.back}
              >
                <ArrowLeft size={18} />
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <span>{activeFile ? activeFile.split('/').pop() : t.logs.noFileSel}</span>
                {activeFile && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {t.logs.pathLabel}: {activeFile}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost"
                onClick={explainLog}
                disabled={!activeFile || contentLoading || isExplaining}
                title={t.common.analyze}
                style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', padding: '0.5rem', fontWeight: 600 }}
              >
                <Sparkles size={18} className={isExplaining ? 'animate-pulse' : ''} />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => activeFile && fetchContent(activeFile)}
                disabled={!activeFile || contentLoading}
                title={t.common.refresh}
                style={{ padding: '0.5rem' }}
              >
                <RefreshCw size={18} className={contentLoading ? 'animate-spin' : ''} />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => clearLog()}
                disabled={!activeFile}
                style={{ color: 'var(--color-warning)', padding: '0.5rem' }}
                title={t.common.clear}
              >
                <Eraser size={18} />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => deleteFile()}
                disabled={!activeFile}
                style={{ color: 'var(--color-danger)', padding: '0.5rem' }}
                title={t.common.delete}
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {logExplanation && (
            <div className="ai-output-block" style={{
              padding: 0,
              background: 'rgba(59, 130, 246, 0.03)',
              borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
              animation: 'slideInDown 0.3s ease',
              maxHeight: '300px',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                color: 'var(--color-primary)',
                position: 'sticky',
                top: 0,
                background: 'rgba(240, 247, 255, 0.95)',
                backdropFilter: 'blur(8px)',
                zIndex: 5,
                borderBottom: '1px solid rgba(59, 130, 246, 0.05)'
              }}>
                <Brain size={18} />
                <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.logs.aiSuggest}</span>
                <button onClick={() => setLogExplanation('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7, padding: '1.25rem', overflowY: 'auto' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{logExplanation}</ReactMarkdown>
              </div>
            </div>
          )}

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'var(--color-surface)', borderTop: '1px solid var(--color-surface-border)' }}>
            <pre
              ref={contentRef}
              style={{
                height: '100%',
                margin: 0,
                padding: '1.5rem',
                color: 'var(--color-text)',
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: '0.85rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: '1.6'
              }}
            >
              {contentLoading ? (
                <div className="flex-center" style={{ height: '100%', color: 'var(--color-text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ marginRight: '1rem' }} />
                  {t.common.loading}
                </div>
              ) : content || (activeFile ? (
                <div className="flex-center" style={{ height: '100%', color: 'var(--color-text-muted)' }}>
                  {t.common.none}
                </div>
              ) : (
                <div className="flex-center" style={{ height: '100%', color: 'var(--color-text-muted)' }}>
                  {t.logs.noFileLeft}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>

      <style jsx>{`
        .logs-layout {
          display: grid;
          grid-template-columns: minmax(300px, 1fr) 3fr;
          gap: 1.5rem;
          align-items: start;
        }

        .log-title {
          font-size: 1.75rem;
          margin-bottom: 0;
        }

        .logs-header {
          flex-wrap: wrap;
          gap: 1rem;
        }

        .mobile-back-btn {
          display: none;
        }

        .log-tab:hover {
          background: rgba(59, 130, 246, 0.05) !important;
        }
        .log-tab:hover .log-item-actions {
          opacity: 1 !important;
        }
        .log-tab.active:hover {
          background: var(--color-primary-light) !important;
        }
        
        @media (max-width: 1024px) {
          .logs-layout {
            grid-template-columns: 300px 1fr;
            gap: 1rem;
          }
        }

        @media (max-width: 768px) {
          .logs-layout {
            grid-template-columns: 1fr;
            gap: 0;
          }

          .log-title {
            font-size: 1.25rem;
          }

          .logs-sidebar, .logs-content {
            height: calc(100vh - 160px) !important;
          }

          .showing-content .logs-sidebar {
            display: none !important;
          }
          
          .showing-list .logs-content {
            display: none !important;
          }

          .mobile-back-btn {
            display: flex;
          }
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
