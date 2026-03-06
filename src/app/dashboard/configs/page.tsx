"use client";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useEffect, useState, useRef } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Settings, FileText, ChevronLeft, RefreshCw, Sparkles } from 'lucide-react';

interface ConfigItem {
  id: string;
  name: string;
  path: string;
  type: 'system' | 'user';
}

export default function ConfigsDashboard() {
  const { t, language, effectiveLang } = useLanguage();
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [aiDemand, setAiDemand] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState('');
  const aiCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    setAnalysisResult('');
    setShowAiPanel(false);
  }, [editingId]);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/configs');
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data || []);
      }
    } catch (e) {
      console.error('Fetch failed', e);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (id: string) => {
    setEditingId(id);
    setReadLoading(true);
    setSaveStatus('');
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', id }),
      });
      const data = await res.json();
      if (data.success) {
        setContent(data.content);
      } else {
        setContent(`${t.common.error}: ${data.details || data.error}`);
      }
    } catch (e) {
      setContent(t.common.networkError);
    } finally {
      setReadLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaveStatus(effectiveLang === 'zh' ? '保存中...' : 'Saving...');
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
        setSaveStatus(`${t.common.saveFailed}: ${data.details || data.error}`);
      }
    } catch (e) {
      setSaveStatus(t.common.networkError);
    }
  };

  const handleAiEdit = async () => {
    if (!content || readLoading || isAiEditing || !aiDemand.trim()) return;

    setIsAiEditing(true);
    setSaveStatus(effectiveLang === 'zh' ? 'AI 正在修改中... 🪄' : 'AI is editing... 🪄');
    try {
      const configName = configs.find(c => c.id === editingId)?.name || 'Configuration';
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `As a system expert, help me modify the configuration file "${configName}".\nUser requirement: ${aiDemand}\n\nCurrent file content:\n${content}\n\nNote: Return the full modified content ONLY without markdown blocks or extra explanation.`,
          systemPrompt: 'You are an expert system administrator.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setContent(data.data);
        setSaveStatus(effectiveLang === 'zh' ? 'AI 修改完成，请检查并保存' : 'AI modification completed, please review and save');
        setAiDemand('');
        setShowAiPanel(false);
        setTimeout(() => setSaveStatus(''), 5000);
      } else {
        setSaveStatus(`AI Fix Failed: ${data.error}`);
      }
    } catch (e) {
      setSaveStatus(t.common.networkError);
    } finally {
      setIsAiEditing(false);
    }
  };

  const handleAiAnalyze = async () => {
    if (!content || readLoading || isAiAnalyzing) return;

    if (analysisResult) {
      setAnalysisResult('');
      return;
    }

    const cacheKey = `${editingId}:${content}`;
    if (aiCacheRef.current[cacheKey]) {
      setAnalysisResult(aiCacheRef.current[cacheKey]);
      return;
    }

    setIsAiAnalyzing(true);
    setAnalysisResult(t.configs.aiExplaining);
    try {
      const configName = configs.find(c => c.id === editingId)?.name || 'Configuration';
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `As a system expert, analyze the configuration file "${configName}". Explain its purpose, security risks, and optimization suggestions. Format in Markdown, language: ${effectiveLang === 'zh' ? 'Chinese' : 'English'}.\n\nContent:\n${content}`,
          systemPrompt: 'You are an expert system administrator.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else {
        setAnalysisResult(`Analyze Failed: ${data.error}`);
      }
    } catch (e) {
      setAnalysisResult(t.common.networkError);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  if (loading) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid no-scrollbar animate-fade-in" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Settings size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.configs.title}</h1>
        </div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }} className="desktop-only">
          {effectiveLang === 'zh' ? '快速修改系统和终端配置文件' : 'Quickly modify system and terminal config files'}
        </div>
      </div>

      <div className={`configs-layout ${editingId ? 'showing-content' : 'showing-list'}`} style={{ marginTop: '0.5rem', alignItems: 'stretch' }}>
        <div className="configs-sidebar card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>
              {effectiveLang === 'zh' ? '可用配置文件' : 'Available config files'}
            </h3>
            <button className="btn btn-ghost btn-sm" onClick={fetchConfigs} disabled={loading} style={{ height: '24px', padding: '0 0.4rem' }}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {configs.map(config => (
                <li key={config.id}
                  onClick={() => handleEdit(config.id)}
                  style={{
                    padding: '1rem',
                    marginBottom: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(0,0,0,0.05)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: editingId === config.id ? 'var(--color-primary-light)' : 'rgba(255,255,255,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}
                  className="hover-scale"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, color: editingId === config.id ? 'var(--color-primary)' : 'inherit' }}>
                      {config.name}
                    </span>
                    <span className={`badge ${config.type === 'system' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.65rem' }}>
                      {config.type === 'system' ? (effectiveLang === 'zh' ? '系统' : 'System') : (effectiveLang === 'zh' ? '用户' : 'User')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {config.path}
                  </div>
                </li>
              ))}
              {configs.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {t.common.none}
                </div>
              )}
            </ul>
          </div>
        </div>

        <div className="configs-content card glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
          {editingId ? (
            <>
              <div className="flex-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button className="btn btn-ghost mobile-back-btn" onClick={() => setEditingId(null)} style={{ padding: '0.4rem' }}>
                    <ChevronLeft size={20} />
                  </button>
                  <FileText size={24} color="var(--color-primary)" className="desktop-only" />
                  <h3 style={{ margin: 0, fontSize: '1rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {configs.find(c => c.id === editingId)?.name}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  {readLoading && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginRight: '0.5rem' }}>{t.common.loading}</span>}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAiAnalyze}
                    disabled={readLoading || isAiAnalyzing || !content}
                    title={t.common.analyze}
                    style={{ color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.12)', fontWeight: 600, border: '1px solid rgba(16, 185, 129, 0.2)' }}
                  >
                    <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isAiAnalyzing ? 'animate-pulse' : ''} />
                    {isAiAnalyzing ? t.common.analyzing : t.common.aiAudit}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAiPanel(!showAiPanel)}
                    disabled={readLoading || isAiEditing || !content}
                    title={effectiveLang === 'zh' ? 'AI 智能编辑' : 'AI Edit'}
                    style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', fontWeight: 600, border: '1px solid rgba(59, 130, 246, 0.2)' }}
                  >
                    <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isAiEditing ? 'animate-pulse' : ''} />
                    {isAiEditing ? (effectiveLang === 'zh' ? 'AI 编辑中...' : 'AI Editing...') : t.common.aiAdjust}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { handleEdit(editingId!); setSaveStatus(''); setAnalysisResult(''); }} title={t.common.refresh}>
                    <RefreshCw size={14} className={readLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {showAiPanel && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.03)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', animation: 'slideInDown 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                    <Sparkles size={14} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{effectiveLang === 'zh' ? 'AI 智能编辑助手' : 'AI Edit Assistant'}</span>
                  </div>
                  <textarea
                    className="input"
                    placeholder={effectiveLang === 'zh' ? "描述你想要进行的修改..." : "Describe changes you want..."}
                    value={aiDemand}
                    onChange={(e) => setAiDemand(e.target.value)}
                    style={{ minHeight: '100px', fontSize: '0.85rem', width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAiPanel(false)}>{t.common.cancel}</button>
                    <button className="btn btn-primary btn-sm" onClick={handleAiEdit} disabled={!aiDemand.trim() || isAiEditing}>
                      {isAiEditing ? (effectiveLang === 'zh' ? '处理中...' : 'Processing...') : (effectiveLang === 'zh' ? '开始执行修改' : 'Apply changes')}
                    </button>
                  </div>
                </div>
              )}

              {analysisResult && (
                <div className="ai-output-block" style={{
                  marginBottom: '1rem', padding: 0,
                  background: 'rgba(59, 130, 246, 0.03)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(59, 130, 246, 0.1)',
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
                    <Sparkles size={16} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t.configs.aiAuditTitle}</span>
                    <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7, padding: '1.25rem', overflowY: 'auto' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                  </div>
                </div>
              )}

              <textarea
                className="input"
                style={{
                  flex: 1,
                  fontFamily: 'monospace',
                  fontSize: '0.9rem',
                  padding: '1rem',
                  resize: 'none',
                  background: '#f1f5f9',
                  color: 'var(--color-text)',
                  lineHeight: '1.5',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-surface-border)',
                  outline: 'none'
                }}
                spellCheck={false}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={readLoading}
              />

              <div className="flex-between" style={{ marginTop: '1.5rem' }}>
                <div>
                  {saveStatus && (
                    <span className={saveStatus.includes('成功') || saveStatus.includes('Success') ? 'badge badge-success' : 'badge badge-danger'}>
                      {saveStatus}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={readLoading || !!saveStatus.includes('Saving')}
                  style={{ padding: '0.6rem 2rem' }}
                >
                  {t.common.save}
                </button>
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                💡 {effectiveLang === 'zh' ? '某些系统文件（如 hosts）可能需要管理员权限。如果保存失败，请确保监控程序具有足够的权限。' : 'Some system files (like hosts) may require admin privileges. Ensure the agent has sufficient permissions if saving fails.'}
              </p>
            </>
          ) : (
            <div className="flex-center" style={{ flex: 1, flexDirection: 'column', color: 'var(--color-text-muted)' }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem', opacity: 0.2 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <p>{effectiveLang === 'zh' ? '请从左侧选择一个配置文件进行查看或编辑' : 'Please select a config file to view or edit'}</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .configs-layout {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 1.5rem;
          align-items: stretch;
          width: 100%;
        }

        .configs-sidebar, .configs-content {
          height: calc(100vh - 200px);
        }

        .mobile-back-btn {
          display: none;
        }

        @media (max-width: 1024px) {
          .configs-layout {
            grid-template-columns: 280px 1fr;
            gap: 1rem;
          }
        }

        @media (max-width: 768px) {
          .configs-layout {
            grid-template-columns: 1fr;
            gap: 0;
            height: auto;
          }

          .configs-sidebar, .configs-content {
            height: calc(100vh - 140px);
            border-radius: var(--radius-md);
          }

          .showing-content .configs-sidebar {
            display: none !important;
          }
          
          .showing-list .configs-content {
            display: none !important;
          }

          .mobile-back-btn {
            display: flex;
          }
           .dashboard-page-header {
             display: ${editingId ? 'none' : 'flex'} !important;
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
