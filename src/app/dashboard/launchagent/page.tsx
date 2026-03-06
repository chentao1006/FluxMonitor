"use client";

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Rocket } from 'lucide-react';

interface PlistItem {
  name: string;
  path: string;
  isLoaded: boolean;
}

export default function LaunchAgentDashboard() {
  const { t, language, effectiveLang } = useLanguage();
  const [plists, setPlists] = useState<PlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [editingFile, setEditingFile] = useState<PlistItem | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [modalError, setModalError] = useState<{ title: string, content: string } | null>(null);

  const isExistingContent = !!(fileContent && fileContent.trim() !== '' && !fileContent.includes('ing...') && !fileContent.includes('读取') && !fileContent.includes('Loading'));

  const fetchPlists = async () => {
    try {
      const res = await fetch('/api/launchagent/list');
      const data = await res.json();
      if (data.success) {
        setPlists(data.data);
      } else {
        setError(data.error || (effectiveLang === 'zh' ? '获取失败' : 'Fetch failed'));
      }
    } catch (e) {
      setError(t.common.networkError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlists();
  }, []);

  const handleAction = async (filePath: string, action: string) => {
    setActionLoading(`${filePath}-${action}`);
    try {
      const res = await fetch('/api/launchagent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, action }),
      });
      const data = await res.json();
      if (data.success) {
        fetchPlists();
      } else {
        setModalError({
          title: effectiveLang === 'zh' ? `${action === 'load' ? '加载' : action === 'unload' ? '卸载' : '操作'}失败` : `${action} failed`,
          content: data.details || data.error || (effectiveLang === 'zh' ? '未知错误' : 'Unknown error')
        });
      }
    } catch (e) {
      setModalError({ title: t.common.networkError, content: effectiveLang === 'zh' ? '无法连接到服务器，请检查网络连接。' : 'Unable to connect to server.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNew = () => {
    let name = prompt(effectiveLang === 'zh' ? '请输入新建配置的名称 (如 com.example.app.plist):' : 'Enter new config name (e.g. com.example.app.plist):', 'com.example.agent.plist');
    if (!name) return;
    if (!name.endsWith('.plist')) name += '.plist';

    let basePath = '';
    if (plists.length > 0) {
      basePath = plists[0].path.replace(plists[0].name, '');
    } else {
      basePath = '/Users/chentao/Library/LaunchAgents/';
    }
    const newPath = basePath + name;

    setEditingFile({ name, path: newPath, isLoaded: false });
    const defaultContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${name.replace('.plist', '')}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/path/to/executable</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>`;
    setFileContent(defaultContent);
    setSaveStatus('');
  };

  const handleDelete = async (filePath: string) => {
    if (!window.confirm(t.common.deleteConfirm)) return;

    setActionLoading(`${filePath}-delete`);
    try {
      const res = await fetch('/api/launchagent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, action: 'delete' }),
      });
      const data = await res.json();
      if (data.success) {
        if (editingFile?.path === filePath) setEditingFile(null);
        fetchPlists();
      } else {
        setModalError({ title: t.common.saveFailed, content: data.details || data.error || 'Unknown error' });
      }
    } catch (e) {
      setModalError({ title: t.common.networkError, content: 'Network connection failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRename = async (filePath: string, currentName: string) => {
    let newName = prompt(effectiveLang === 'zh' ? `请输入新的文件名 (当前: ${currentName}):` : `Enter new filename (Current: ${currentName}):`, currentName);
    if (!newName || newName === currentName) return;
    if (!newName.endsWith('.plist')) newName += '.plist';

    const basePath = filePath.replace(currentName, '');
    const newFilePath = basePath + newName;

    setActionLoading(`${filePath}-rename`);
    try {
      const res = await fetch('/api/launchagent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath, action: 'rename', newFilePath }),
      });
      const data = await res.json();
      if (data.success) {
        if (editingFile?.path === filePath) setEditingFile(null);
        fetchPlists();
      } else {
        setModalError({ title: effectiveLang === 'zh' ? '重命名失败' : 'Rename failed', content: data.details || data.error || 'Unknown error' });
      }
    } catch (e) {
      setModalError({ title: t.common.networkError, content: 'Network connection failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const openEditor = async (item: PlistItem) => {
    setEditingFile(item);
    setFileContent(t.common.loading);
    setSaveStatus('');
    try {
      const res = await fetch('/api/launchagent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: item.path, action: 'read' }),
      });
      const data = await res.json();
      if (data.success) {
        setFileContent(data.data);
      } else {
        setFileContent(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setFileContent(t.common.networkError);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    setSaveStatus(effectiveLang === 'zh' ? '保存中...' : 'Saving...');
    try {
      const res = await fetch('/api/launchagent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: editingFile.path, action: 'write', content: fileContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus(t.common.saveSuccess);
        fetchPlists();
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus(`${t.common.saveFailed}: ${data.error}`);
      }
    } catch (e) {
      setSaveStatus(t.common.networkError);
    }
  };

  const generateAIPlist = async () => {
    if (!aiPrompt) return;
    setAiLoading(true);
    setSaveStatus(effectiveLang === 'zh' ? 'AI 魔法生成中... 🪄' : 'AI is generating... 🪄');

    const promptText = isExistingContent
      ? `请参考以下已有的 macOS LaunchAgent plist 内容，并根据新的需求进行修改：\n\n---当前内容---\n${fileContent}\n---当前内容---\n\n新的修改需求: ${aiPrompt}\n\n注意：必须仅返回修改后的纯 plist XML 代码文本，不要包含任何 markdown 语法（如 \`\`\`xml）和多余对话，直接以 <?xml 打头。`
      : `请根据以下需求，为我生成一份 macOS LaunchAgent 的 plist 配置文件。\n需求: ${aiPrompt}\n注意：必须仅返回纯 plist XML 代码文本，不要包含任何 markdown 语法（如 \`\`\`xml）和多余对话，直接以 <?xml 打头。`;

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText })
      });
      const data = await res.json();
      if (data.success) {
        setFileContent(data.data);
        setSaveStatus(effectiveLang === 'zh' ? '✅ 生成完成！请核对' : '✅ Generated! Please review');
      } else {
        setSaveStatus(`${effectiveLang === 'zh' ? '生成失败' : 'Generate failed'}: ${data.error || data.details}`);
      }
    } catch {
      setSaveStatus(t.common.networkError);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading && plists.length === 0) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid">
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Rocket size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.sidebar.launchagent}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }} className="mobile-full-width">
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleAddNew}>{effectiveLang === 'zh' ? '添加配置' : 'Add Config'}</button>
          <button className="btn btn-ghost" style={{ flex: 1, border: '1px solid var(--color-surface-border)' }} onClick={fetchPlists}>{t.common.refresh}</button>
        </div>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ display: 'block', padding: '1rem', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      <div className={`responsive-grid ${editingFile ? 'responsive-grid-2' : ''}`} style={{ transition: 'all 0.3s' }}>
        <div className="card glass-panel" style={{ maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
          <h2 className="card-title">~/Library/LaunchAgents</h2>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {plists.map((plist) => (
              <li key={plist.name} style={{
                padding: '1rem', borderBottom: '1px solid rgba(0,0,0,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: editingFile?.name === plist.name ? 'var(--color-primary-light)' : 'transparent',
                borderRadius: 'var(--radius-sm)'
              }}>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: '0.25rem', wordBreak: 'break-all' }}>{plist.name}</div>
                  <div>
                    <span className={`badge ${plist.isLoaded ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                      {plist.isLoaded ? (effectiveLang === 'zh' ? '已加载 / 运行中' : 'Loaded / Running') : (effectiveLang === 'zh' ? '未加载' : 'Not Loaded')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '200px' }}>
                  <button
                    className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                    onClick={() => openEditor(plist)}
                  >
                    {t.common.edit}
                  </button>

                  {plist.isLoaded ? (
                    <>
                      <button
                        className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#f59e0b', border: '1px solid #f59e0b' }}
                        onClick={() => handleAction(plist.path, 'reload')}
                        disabled={actionLoading === `${plist.path}-reload`}
                      >
                        {t.common.restart}
                      </button>
                      <button
                        className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#ef4444', border: '1px solid #ef4444' }}
                        onClick={() => handleAction(plist.path, 'unload')}
                        disabled={actionLoading === `${plist.path}-unload`}
                      >
                        {t.common.stop}
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#10b981', border: '1px solid #10b981' }}
                      onClick={() => handleAction(plist.path, 'load')}
                      disabled={actionLoading === `${plist.path}-load`}
                    >
                      {t.common.start}
                    </button>
                  )}

                  <button
                    className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#8b5cf6', border: '1px solid #c4b5fd' }}
                    onClick={() => handleRename(plist.path, plist.name)}
                    disabled={actionLoading === `${plist.path}-rename`}
                  >
                    {effectiveLang === 'zh' ? '重命名' : 'Rename'}
                  </button>

                  <button
                    className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', color: '#64748b', border: '1px solid #cbd5e1' }}
                    onClick={() => handleDelete(plist.path)}
                    disabled={actionLoading === `${plist.path}-delete`}
                  >
                    {t.common.delete}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {plists.length === 0 && !loading && <div style={{ padding: '1rem', color: 'var(--color-text-muted)' }}>{t.common.none}</div>}
        </div>

        {editingFile && (
          <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 150px)' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0, wordBreak: 'break-all', fontSize: '1.1rem' }}>{t.common.edit}: {editingFile.name}</h2>
              <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditingFile(null)}>{t.common.close}</button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', background: 'linear-gradient(135deg, rgba(56,189,248,0.1), rgba(168,85,247,0.1))', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <input
                type="text"
                className="input"
                style={{ flex: 1, border: 'none', background: 'transparent' }}
                placeholder={isExistingContent ? (effectiveLang === 'zh' ? "描述你想要如何修改这段配置..." : "Describe how to modify...") : (effectiveLang === 'zh' ? "想要系统替你写什么？" : "What should AI write?")}
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && generateAIPlist()}
              />
              <button className="btn btn-primary" style={{ background: 'linear-gradient(to right, #38bdf8, #a855f7)', border: 'none' }} onClick={generateAIPlist} disabled={aiLoading}>
                {aiLoading ? t.common.loading : '🪄 AI ' + (isExistingContent ? t.common.edit : effectiveLang === 'zh' ? '生成' : 'Gen')}
              </button>
            </div>

            <textarea
              className="input"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', padding: '1rem', resize: 'none', background: '#fafafa', minHeight: '300px' }}
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
            />

            <div className="flex-between" style={{ marginTop: '1rem' }}>
              <span className={saveStatus.includes('成功') || saveStatus.includes('Success') ? 'badge badge-success' : 'badge badge-warning'} style={{ opacity: saveStatus ? 1 : 0 }}>
                {saveStatus || 'Ready'}
              </span>
              <button className="btn btn-primary" onClick={saveFile}>{t.common.save}</button>
            </div>

            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {effectiveLang === 'zh' ? '注意: 保存 plist 文件后，通常需要点击「重载」或「加载」以使更改生效。' : 'Note: After saving, you usually need to Restart or Start the agent.'}
            </div>
          </div>
        )}
      </div>

      {modalError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem'
        }}>
          <div className="card glass-panel animate-fade-in" style={{
            maxWidth: '500px', width: '100%', background: 'white',
            display: 'flex', flexDirection: 'column', gap: '1rem'
          }}>
            <h3 style={{ margin: 0, color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>⚠️</span> {modalError.title}
            </h3>
            <div style={{
              background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-sm)',
              fontFamily: 'monospace', fontSize: '0.85rem', color: '#334155',
              maxHeight: '300px', overflowY: 'auto', border: '1px solid #e2e8f0',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              {modalError.content}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => setModalError(null)}>
                {t.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
