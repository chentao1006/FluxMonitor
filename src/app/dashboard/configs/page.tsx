"use client";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useEffect, useState } from 'react';
import { Settings, FileText, ChevronLeft, RefreshCw, Sparkles } from 'lucide-react';

interface ConfigItem {
  id: string;
  name: string;
  path: string;
  type: 'system' | 'user';
}

export default function ConfigsDashboard() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [aiDemand, setAiDemand] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [readLoading, setReadLoading] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);

  useEffect(() => {
    fetchConfigs();
  }, []);

  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/configs');
      const data = await res.json();
      if (data.success) {
        setConfigs(data.data || []);
      }
    } catch (e) {
      console.error('获取配置列表失败', e);
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
        setContent(`读取失败: ${data.details || data.error}`);
      }
    } catch (e) {
      setContent('网络请求失败');
    } finally {
      setReadLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaveStatus('保存中...');
    try {
      const res = await fetch('/api/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', id: editingId, content }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('保存成功!');
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus(`保存失败: ${data.details || data.error}`);
      }
    } catch (e) {
      setSaveStatus('网络请求失败');
    }
  };

  const handleAiEdit = async () => {
    if (!content || readLoading || isAiEditing || !aiDemand.trim()) return;

    setIsAiEditing(true);
    setSaveStatus('AI 正在修改中... 🪄');
    try {
      const configName = configs.find(c => c.id === editingId)?.name || '配置文件';
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请作为资深系统专家，帮助我修改以下配置文件 "${configName}"。\n用户的需求是：${aiDemand}\n\n当前文件内容如下：\n${content}\n\n注意：请直接返回修改后的完整文件内容，不要包含任何 markdown 块或解释文字。`,
          systemPrompt: 'You are an expert system administrator proficient in various configuration formats like JSON, YAML, TOML, and bash scripts.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setContent(data.data);
        setSaveStatus('AI 修改完成，请检查并保存');
        setAiDemand('');
        setShowAiPanel(false);
        setTimeout(() => setSaveStatus(''), 5000);
      } else {
        setSaveStatus(`AI 修改失败: ${data.error}`);
      }
    } catch (e) {
      setSaveStatus('网络请求失败');
    } finally {
      setIsAiEditing(false);
    }
  };

  if (loading) return <div className="flex-center" style={{ height: '70vh' }}>加载中...</div>;

  return (
    <div className="grid no-scrollbar animate-fade-in" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Settings size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>配置管理</h1>
        </div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }} className="desktop-only">
          快速修改系统和终端配置文件
        </div>
      </div>

      <div className={`configs-layout ${editingId ? 'showing-content' : 'showing-list'}`} style={{ marginTop: '0.5rem', alignItems: 'stretch' }}>
        {/* Left Column: Config List */}
        <div className="configs-sidebar card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>可用配置文件</h3>
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
                      {config.type === 'system' ? '系统' : '用户'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {config.path}
                  </div>
                </li>
              ))}
              {configs.length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  未检测到任何支持的配置文件
                </div>
              )}
            </ul>
          </div>
        </div>

        {/* Right Column: Editor */}
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
                  {readLoading && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginRight: '0.5rem' }}>读取中...</span>}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowAiPanel(!showAiPanel)}
                    disabled={readLoading || isAiEditing || !content}
                    title="AI 智能编辑"
                    style={{ color: 'var(--color-primary)', background: 'rgba(59, 130, 246, 0.05)' }}
                  >
                    <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isAiEditing ? 'animate-pulse' : ''} />
                    {isAiEditing ? 'AI 编辑中...' : 'AI 编辑'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { handleEdit(editingId!); setSaveStatus(''); }} title="重新读取">
                    <RefreshCw size={14} className={readLoading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {showAiPanel && (
                <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.03)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', animation: 'slideInDown 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                    <Sparkles size={14} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>AI 智能编辑助手</span>
                  </div>
                  <textarea
                    className="input"
                    placeholder="描述你想要进行的修改，例如：'将端口改为 8080'，'添加代理配置'，'优化注释'..."
                    value={aiDemand}
                    onChange={(e) => setAiDemand(e.target.value)}
                    style={{ minHeight: '100px', fontSize: '0.85rem', width: '100%' }}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowAiPanel(false)}>取消</button>
                    <button className="btn btn-primary btn-sm" onClick={handleAiEdit} disabled={!aiDemand.trim() || isAiEditing}>
                      {isAiEditing ? '处理中...' : '开始执行修改'}
                    </button>
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
                    <span className={saveStatus.includes('成功') ? 'badge badge-success' : 'badge badge-danger'}>
                      {saveStatus}
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleSave}
                  disabled={readLoading || !!saveStatus.includes('保存中')}
                  style={{ padding: '0.6rem 2rem' }}
                >
                  保存修改
                </button>
              </div>
              <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                💡 某些系统文件（如 hosts）可能需要管理员权限。如果保存失败，请确保监控程序具有足够的权限。
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
              <p>请从左侧选择一个配置文件进行查看或编辑</p>
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
    </div >
  );
}
