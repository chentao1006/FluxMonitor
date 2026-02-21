"use client";

import { useEffect, useState, useRef } from 'react';
import { RefreshCw, Trash2, FileText, ChevronRight, Search, Eraser } from 'lucide-react';

export default function LogsPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [contentLoading, setContentLoading] = useState(false);
  const contentRef = useRef<HTMLPreElement>(null);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      if (data.success) {
        setFiles(data.data);
        if (data.data.length > 0 && !activeFile) {
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
        // Scroll to bottom after content load
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }, 100);
      } else {
        setContent(`错误: ${data.error}`);
      }
    } catch (e) {
      setContent('加载失败');
    } finally {
      setContentLoading(false);
    }
  };

  const clearLog = async () => {
    if (!activeFile) return;
    if (!window.confirm('确定要清理该日志文件吗？此操作不可撤销。')) return;

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', file: activeFile })
      });
      const data = await res.json();
      if (data.success) {
        setContent('');
        fetchFiles(); // Refresh to update size
      } else {
        alert(`清理失败: ${data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    }
  };

  const deleteFile = async () => {
    if (!activeFile) return;
    if (!window.confirm(`⚠️ 高危操作：\n\n确定要彻底删除日志文件吗？\n${activeFile}`)) return;

    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', file: activeFile })
      });
      const data = await res.json();
      if (data.success) {
        setActiveFile(null);
        setContent('');
        fetchFiles();
      } else {
        alert(`删除失败: ${data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (activeFile) {
      fetchContent(activeFile);
    }
  }, [activeFile]);

  useEffect(() => {
    const filtered = files.filter(f =>
      f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.path.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredFiles(filtered);
  }, [searchTerm, files]);

  if (loading && files.length === 0) return <div className="flex-center" style={{ height: '70vh' }}>加载日志列表中...</div>;

  return (
    <div className="grid animate-fade-in">
      <div className="flex-between" style={{ marginBottom: '1rem' }}>
        <h1 className="card-title" style={{ fontSize: '1.75rem', marginBottom: '0' }}>日志浏览 📜</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={fetchFiles} title="刷新列表">
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      <div className="responsive-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 3fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Left Side: Tabs / File List */}
        <div className="card glass-panel" style={{ padding: '0', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="input"
                placeholder="搜索日志文件..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '2.5rem', fontSize: '0.9rem' }}
              />
              <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {filteredFiles.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                {files.length === 0 ? '未在 ~/Applications 下找到 .log 文件' : '未找到匹配的日志'}
              </div>
            ) : (
              filteredFiles.map((file) => (
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
                  <FileText size={16} style={{ flexShrink: 0, opacity: activeFile === file.path ? 1 : 0.6 }} />
                  <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: activeFile === file.path ? 600 : 400 }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', opacity: 0.8 }}>
                      {(file.size / 1024).toFixed(1)} KB | {new Date(file.mtime).toLocaleString()}
                    </div>
                  </div>
                  {activeFile === file.path && <ChevronRight size={14} />}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Content Area */}
        <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 200px)', padding: 0, overflow: 'hidden' }}>
          <div className="flex-between" style={{ padding: '1rem', borderBottom: '1px solid var(--color-surface-border)', background: 'rgba(255,255,255,0.3)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span>{activeFile ? activeFile.split('/').pop() : '未选择文件'}</span>
                {activeFile && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    路径: {activeFile}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost"
                onClick={() => activeFile && fetchContent(activeFile)}
                disabled={!activeFile || contentLoading}
                title="刷新内容"
                style={{ padding: '0.5rem' }}
              >
                <RefreshCw size={18} className={contentLoading ? 'animate-spin' : ''} />
              </button>
              <button
                className="btn btn-ghost"
                onClick={clearLog}
                disabled={!activeFile}
                style={{ color: 'var(--color-warning)', padding: '0.5rem' }}
                title="清空日志内容 (保留文件)"
              >
                <Eraser size={18} />
              </button>
              <button
                className="btn btn-ghost"
                onClick={deleteFile}
                disabled={!activeFile}
                style={{ color: 'var(--color-danger)', padding: '0.5rem' }}
                title="彻底删除文件"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#0f172a' }}>
            <pre
              ref={contentRef}
              style={{
                height: '100%',
                margin: 0,
                padding: '1.5rem',
                color: '#e2e8f0',
                fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: '0.85rem',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                lineHeight: '1.6'
              }}
            >
              {contentLoading ? (
                <div className="flex-center" style={{ height: '100%', color: '#94a3b8' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ marginRight: '1rem' }} />
                  正在加载日志内容...
                </div>
              ) : content || (activeFile ? (
                <div className="flex-center" style={{ height: '100%', color: '#64748b' }}>
                  日志文件为空
                </div>
              ) : (
                <div className="flex-center" style={{ height: '100%', color: '#64748b' }}>
                  请从左侧选择一个日志文件进行查看
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>

      <style jsx>{`
        .log-tab:hover {
          background: rgba(59, 130, 246, 0.05) !important;
        }
        .log-tab.active:hover {
          background: var(--color-primary-light) !important;
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
