"use client";

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Rocket, ChevronLeft, Sparkles, Brain, Save, Trash2, X, RefreshCw, Eraser, Play, Square, Repeat } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface PlistItem {
  name: string;
  path: string;
  isLoaded: boolean;
  size: number;
  mtime: number;
}

export default function LaunchAgentDashboard() {
  const { t, effectiveLang } = useLanguage();

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
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

  const [plists, setPlists] = useState<PlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [editingFile, setEditingFile] = useState<PlistItem | null>(null);
  const [editName, setEditName] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  const [analysisResult, setAnalysisResult] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [modalError, setModalError] = useState<{ title: string, content: string } | null>(null);

  const fetchPlists = async () => {
    try {
      const res = await fetch('/api/launchagent/list');
      const data = await res.json();
      if (data.success) {
        setPlists(data.data);
      } else {
        setError(data.error || t.common.fetchFailed);
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
          title: action === 'load' ? t.launchagent.loadFailed : action === 'unload' ? t.launchagent.unloadFailed : t.common.actionFailed,
          content: data.details || data.error || t.common.unknownError
        });
      }
    } catch (e) {
      setModalError({ title: t.common.networkError, content: t.common.networkConnectionFailed });
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNew = () => {
    let name = prompt(t.launchagent.newConfigPrompt, 'com.example.agent.plist');
    if (!name) return;
    if (!name.endsWith('.plist')) name += '.plist';

    let basePath = '';
    if (plists.length > 0) {
      const firstPath = plists[0].path;
      basePath = firstPath.substring(0, firstPath.lastIndexOf('/') + 1);
    } else {
      basePath = '/Users/chentao/Library/LaunchAgents/';
    }
    const newPath = basePath + name;
    setEditingFile({ name, path: newPath, isLoaded: false, size: 0, mtime: 0 });
    setEditName(name.replace('.plist', ''));
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
    setAnalysisResult('');
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
        setModalError({ title: t.common.saveFailed, content: data.details || data.error || t.common.unknownError });
      }
    } catch (e) {
      setModalError({ title: t.common.networkError, content: 'Network connection failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const openEditor = async (item: PlistItem) => {
    setEditingFile(item);
    setEditName(item.name.replace('.plist', ''));
    setFileContent(t.common.loading);
    setSaveStatus('');
    setAnalysisResult('');
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
    setSaveStatus(t.common.saving);
    try {
      let currentPath = editingFile.path;
      let currentName = editingFile.name;

      if (editName.replace('.plist', '') !== currentName.replace('.plist', '')) {
        let newName = editName;
        if (!newName.endsWith('.plist')) newName += '.plist';
        const basePath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
        const newPath = basePath + newName;

        const renameRes = await fetch('/api/launchagent/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: currentPath, action: 'rename', newFilePath: newPath }),
        });
        const renameData = await renameRes.json();
        if (renameData.success) {
          currentPath = newPath;
          currentName = newName;
          setEditingFile({ ...editingFile, path: newPath, name: newName });
        } else {
          setSaveStatus(`${t.common.renameFailed}: ${renameData.error}`);
          return;
        }
      }

      const res = await fetch('/api/launchagent/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: currentPath, action: 'write', content: fileContent }),
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

  const handleAiExplain = async () => {
    if (!fileContent || isAiAnalyzing) return;
    if (analysisResult) { setAnalysisResult(''); return; }

    setIsAiAnalyzing(true);
    setAnalysisResult(t.launchagent.aiExplaining);
    try {
      const prompt = t.launchagent.aiExplainPrompt.replace('{content}', fileContent);
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          systemPrompt: 'You are an expert system administrator Specialized in macOS Launch Agents and background processes.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
      } else {
        setAnalysisResult(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setAnalysisResult(t.common.networkError);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  if (loading && plists.length === 0) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="page-shell grid no-scrollbar animate-fade-in" style={{ width: '100%', maxWidth: '100%' }}>
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Rocket size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.sidebar.launchagent}</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }} className="mobile-full-width">
          <button className="btn btn-primary" style={{ padding: '0.6rem 1.2rem' }} onClick={handleAddNew}>{t.launchagent.addConfig}</button>
          <button className="btn btn-ghost" style={{ padding: '0.6rem 1rem', border: '1px solid var(--color-surface-border)' }} onClick={fetchPlists}>{t.common.refresh}</button>
        </div>
      </div>

      <div className={`responsive-grid ${editingFile ? 'showing-content' : 'showing-list'} ${!editingFile ? 'responsive-grid-auto' : ''}`}>
        <div className="launchagent-sidebar card glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', overflow: 'hidden', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <h2 style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '1rem', fontWeight: 600 }}>~/Library/LaunchAgents</h2>

          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', width: '100%', paddingRight: '0.2rem' }}>
            {plists.map((plist) => (
              <div
                key={plist.name}
                className={`plist-tab ${editingFile?.name === plist.name ? 'active' : ''}`}
                onClick={() => openEditor(plist)}
                style={{
                  padding: '1rem',
                  marginBottom: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  background: editingFile?.name === plist.name ? 'var(--color-primary-light)' : 'rgba(255,255,255,0.4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  border: editingFile?.name === plist.name ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid transparent'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: editingFile?.name === plist.name ? 'var(--color-primary)' : 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left', unicodeBidi: 'plaintext' }}>
                  {plist.name.replace(/\.plist$/, '')}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'flex', justifyContent: 'space-between', fontWeight: 500, opacity: 0.7 }}>
                  <span>{formatSize(plist.size || 0)}</span>
                  <span>{formatAbsoluteTime(plist.mtime || 0)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge ${plist.isLoaded ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}>
                    {plist.isLoaded ? t.launchagent.loadedRunning : t.launchagent.notLoaded}
                  </span>

                  <div className="plist-quick-actions" style={{ display: 'flex', gap: '0.25rem' }}>
                    {plist.isLoaded ? (
                      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleAction(plist.path, 'unload'); }} title={t.common.unload}><Square size={12} color="#ef4444" /></button>
                    ) : (
                      <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleAction(plist.path, 'load'); }} title={t.common.load}><Play size={12} color="#10b981" /></button>
                    )}
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleAction(plist.path, 'reload'); }} title={t.common.reload}><Repeat size={12} color="#f59e0b" /></button>
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); handleDelete(plist.path); }} title={t.common.delete}><Trash2 size={12} color="#64748b" /></button>
                  </div>
                </div>
              </div>
            ))}
            {plists.length === 0 && !loading && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>{t.common.none}</div>
            )}
          </div>
        </div>

        <div className="launchagent-content card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', padding: 0, overflow: 'hidden' }}>
          {editingFile ? (
            <>
              <div className="flex-between" style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)', background: 'rgba(255,255,255,0.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                  <button className="btn btn-ghost mobile-only" onClick={() => setEditingFile(null)}><ChevronLeft size={20} /></button>
                  <input
                    type="text"
                    className="input-inline"
                    style={{ fontWeight: 600, fontSize: '0.95rem', border: 'none', background: 'transparent', width: '100%' }}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={t.launchagent.newConfigPrompt}
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAiExplain}
                    disabled={isAiAnalyzing}
                    style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', height: '28px', gap: '6px' }}
                  >
                    <Sparkles size={15} className={isAiAnalyzing ? 'animate-pulse' : ''} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{isAiAnalyzing ? t.common.analyzing : t.common.analyze}</span>
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={saveFile} style={{ height: '28px', padding: '0 0.75rem' }}>
                    <Save size={14} style={{ marginRight: '4px' }} /> {t.common.save}
                  </button>
                </div>
              </div>

              {analysisResult && (
                <div className="ai-output-block" style={{
                  padding: 0,
                  background: 'rgba(59, 130, 246, 0.03)',
                  borderBottom: '1px solid rgba(59, 130, 246, 0.1)',
                  maxHeight: '300px',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative'
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1rem',
                    color: 'var(--color-primary)',
                    position: 'sticky',
                    top: 0,
                    background: 'rgba(240, 247, 255, 0.95)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 5
                  }}>
                    <Brain size={16} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{t.launchagent.aiExplainTitle}</span>
                    <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-text-muted)' }}><X size={14} /></button>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#1e293b', lineHeight: 1.6, padding: '1rem', overflowY: 'auto' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                  </div>
                </div>
              )}

              <textarea
                className="input"
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', padding: '1.5rem', resize: 'none', border: 'none', outline: 'none', background: 'transparent' }}
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                spellCheck={false}
              />

              <div style={{ padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.02)', borderTop: '1px solid var(--color-surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="save-status" style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', visibility: saveStatus ? 'visible' : 'hidden' }}>
                  {saveStatus}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', opacity: 0.6 }}>
                  {t.launchagent.saveNote}
                </span>
              </div>
            </>
          ) : (
            <div className="flex-center" style={{ flex: 1, flexDirection: 'column', color: 'var(--color-text-muted)' }}>
              <Rocket size={64} strokeWidth={1} style={{ opacity: 0.1, marginBottom: '1rem' }} />
              <p>{t.common.loading.replace('...', '')}</p>
            </div>
          )}
        </div>
      </div>

      {modalError && (
        <div className="modal-overlay" onClick={() => setModalError(null)}>
          <div className="card glass-panel modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', width: '90%' }}>
            <h3 style={{ margin: 0, color: 'var(--color-danger)', marginBottom: '1rem' }}>⚠️ {modalError.title}</h3>
            <pre style={{ background: '#f8fafc', padding: '1rem', borderRadius: '4px', fontSize: '0.8rem', whiteSpace: 'pre-wrap', maxHeight: '300px', overflowY: 'auto' }}>
              {modalError.content}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setModalError(null)}>{t.common.confirm}</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .responsive-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) 3fr; gap: 1.5rem; align-items: start; width: 100%; max-width: 100%; box-sizing: border-box; }
        .plist-tab:hover { background: rgba(59, 130, 246, 0.05) !important; }
        .input-inline:focus { outline: none; border-bottom: 2px solid var(--color-primary); }
        .btn-icon { background: none; border: none; cursor: pointer; padding: 0.2rem; border-radius: 4px; display: flex; align-items: center; transition: background 0.2s; }
        .btn-icon:hover { background: rgba(0,0,0,0.05); }
        .save-status { animation: fadeIn 0.3s; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .mobile-only { display: none; }
        .desktop-only { display: flex; }

        @media (max-width: 768px) {
          .page-shell { height: 100%; display: flex; flex-direction: column; overflow: hidden; }
          .responsive-grid { flex: 1 !important; min-height: 0; display: flex !important; flex-direction: column; height: auto !important; width: 100%; max-width: 100%; overflow-x: hidden; }
          .showing-content .launchagent-sidebar { display: none !important; }
          .showing-list .launchagent-content { display: none !important; }
          .mobile-only { display: flex !important; }
          .desktop-only { display: none !important; }
          .launchagent-sidebar, .launchagent-content {
            flex: 1 !important;
            min-height: 0;
            height: auto !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }
        }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); display: flex; alignItems: center; justifyContent: center; zIndex: 1000; padding: 1rem; }
      `}</style>
    </div>
  );
}
