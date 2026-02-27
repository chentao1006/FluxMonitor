"use client";

import { useEffect, useState } from 'react';
import { Settings, FileText } from 'lucide-react';

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
  const [readLoading, setReadLoading] = useState(false);

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

  if (loading) return <div className="flex-center" style={{ height: '70vh' }}>加载中...</div>;

  return (
    <div className="grid">
      <div className="flex-between" style={{ marginBottom: '1rem', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Settings size={28} color="var(--color-primary)" />
          <h1 className="card-title" style={{ fontSize: '1.75rem', margin: 0 }}>配置管理</h1>
        </div>
        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
          快速修改系统和终端配置文件
        </div>
      </div>

      <div className="responsive-grid responsive-grid-2" style={{ marginTop: '1rem', alignItems: 'stretch' }}>
        {/* Left Column: Config List */}
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>可用配置文件</h3>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '600px' }}>
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
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', minHeight: '500px' }}>
          {editingId ? (
            <>
              <div className="flex-between" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <FileText size={28} color="var(--color-primary)" />
                  <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                    正在编辑: {configs.find(c => c.id === editingId)?.name}
                  </h3>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {readLoading && <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>正在读取...</span>}
                  <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditingId(null)}>重置</button>
                </div>
              </div>

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
    </div>
  );
}
