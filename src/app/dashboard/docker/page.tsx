"use client";

import { useEffect, useState, useRef } from 'react';
import { Play, Square, RotateCw, Trash2, FileText, Server, HardDrive, Box } from 'lucide-react';

interface Container {
  ID: string;
  Image: string;
  Command: string;
  CreatedAt: string;
  Status: string;
  Names: string;
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
  const [activeTab, setActiveTab] = useState<'containers' | 'images'>('containers');
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<DockerImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Logs dialog
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [currentLogs, setCurrentLogs] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto scroll logs to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [currentLogs, isLogsOpen]);

  const fetchData = async () => {
    try {
      if (activeTab === 'containers') {
        const res = await fetch('/api/docker/containers');
        const data = await res.json();
        if (data.success) {
          setContainers(data.data);
          setError('');
        } else {
          setError(data.error || '获取容器失败');
        }
      } else {
        const res = await fetch('/api/docker/images');
        const data = await res.json();
        if (data.success) {
          setImages(data.data);
          setError('');
        } else {
          setError(data.error || '获取镜像失败');
        }
      }
    } catch (e) {
      setError('网络请求失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

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
        alert(`操作失败: ${data.details || data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    } finally {
      setActionLoading(null);
    }
  };

  const showLogs = async (id: string) => {
    setIsLogsOpen(true);
    setCurrentLogs('');
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/docker/logs?id=${id}`);
      const data = await res.json();
      if (data.success) {
        setCurrentLogs(data.logs || '没有日志');
      } else {
        setCurrentLogs(`获取日志失败: ${data.details || data.error}`);
      }
    } catch (e) {
      setCurrentLogs('网络请求失败');
    } finally {
      setLogsLoading(false);
    }
  };

  return (
    <div className="grid">
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Box size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>Docker</h1>
        </div>
        <button className="btn btn-ghost mobile-full-width" onClick={fetchData} disabled={loading} style={{ gap: '0.5rem', height: '36px' }}>
          <RotateCw size={18} className={loading ? 'animate-spin' : ''} /> 刷新数据
        </button>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ display: 'block', padding: '1rem', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="tab-scroll-container no-scrollbar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-surface-border)', overflowX: 'auto', paddingBottom: '2px' }}>
        <button
          className={`btn ${activeTab === 'containers' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('containers')}
          style={{ borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          <Server size={18} /> 容器管理
        </button>
        <button
          className={`btn ${activeTab === 'images' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('images')}
          style={{ borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1rem', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          <HardDrive size={18} /> 镜像管理
        </button>
      </div>

      <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start', padding: '1rem' }}>
        <div>
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
            {activeTab === 'containers' ? '总容器数' : '总镜像数'}
          </h3>
          <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
            {activeTab === 'containers' ? containers.length : images.length}
          </div>
          {activeTab === 'containers' && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.15rem' }}>
              运行中: {containers.filter(c => c.Status.includes('Up')).length}
            </div>
          )}
        </div>
        <div className={`badge ${!error ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>
          {!error ? '服务正常' : '服务异常'}
        </div>
      </div>

      <div className="card glass-panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="docker-table-container">
          {activeTab === 'containers' ? (
            <table className="docker-table">
              <thead>
                <tr style={{ background: 'var(--color-primary-light)', borderBottom: '1px solid var(--color-surface-border)' }}>
                  <th className="col-name">名称 / ID</th>
                  <th className="col-image">镜像</th>
                  <th className="col-status">状态</th>
                  <th className="col-actions">操作</th>
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
                      </td>
                      <td className="col-image">
                        <div style={{ fontSize: '0.85rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.Image}</div>
                      </td>
                      <td className="col-status">
                        <span className={`badge ${isUp ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                          {c.Status}
                        </span>
                      </td>
                      <td className="col-actions">
                        <div className="action-buttons">
                          {isUp ? (
                            <>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-warning)' }}
                                onClick={() => handleAction(c.ID, 'restart')} disabled={actionLoading === `${c.ID}-restart`} title="重启"
                              ><RotateCw size={14} className={actionLoading === `${c.ID}-restart` ? 'animate-spin' : ''} /></button>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-danger)' }}
                                onClick={() => handleAction(c.ID, 'stop')} disabled={actionLoading === `${c.ID}-stop`} title="停止"
                              ><Square size={14} /></button>
                            </>
                          ) : (
                            <>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-success)' }}
                                onClick={() => handleAction(c.ID, 'start')} disabled={actionLoading === `${c.ID}-start`} title="启动"
                              ><Play size={14} /></button>
                              <button
                                className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-text-muted)' }}
                                onClick={() => { if (window.confirm('确定要删除此容器吗？')) handleAction(c.ID, 'rm'); }} disabled={actionLoading === `${c.ID}-rm`} title="删除"
                              ><Trash2 size={14} /></button>
                            </>
                          )}
                          <button
                            className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-primary)' }}
                            onClick={() => showLogs(c.ID)} title="日志"
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
                  <th className="col-name">仓库名 / 标签</th>
                  <th className="col-id desktop-only">ID</th>
                  <th className="col-size">大小</th>
                  <th className="col-status">状态</th>
                  <th className="col-actions">操作</th>
                </tr>
              </thead>
              <tbody>
                {images.map((img) => (
                  <tr key={img.ID} className="docker-row">
                    <td className="col-name">
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{img.Repository}</div>
                      <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <span className="badge badge-warning" style={{ fontSize: '0.6rem', padding: '0.1rem 0.3rem' }}>{img.Tag}</span>
                        <span className="mobile-only" style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{img.ID.substring(0, 12)}</span>
                      </div>
                    </td>
                    <td className="col-id desktop-only">
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{img.ID.substring(0, 12)}</div>
                    </td>
                    <td className="col-size">
                      <div style={{ fontSize: '0.85rem' }}>{img.Size}</div>
                    </td>
                    <td className="col-status">
                      <span className={`badge ${img.InUse ? 'badge-primary' : 'badge-ghost'}`} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                        {img.InUse ? '使用中' : '未使用'}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="action-buttons">
                        {!img.InUse && (
                          <button
                            className="btn btn-ghost btn-sm btn-icon" style={{ color: 'var(--color-danger)' }}
                            onClick={() => { if (window.confirm('确定要删除此镜像吗？')) handleAction(img.ID, 'rmi'); }} disabled={actionLoading === `${img.ID}-rmi`} title="删除"
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
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>没有找到任何数据</div>
        )}
      </div>

      {/* Logs Modal */}
      {isLogsOpen && (
        <div className="menu-backdrop" onClick={() => setIsLogsOpen(false)} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }}>
          <div className="card glass-panel" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '900px', height: '80vh', display: 'flex', flexDirection: 'column', margin: 'auto' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--color-surface-border)', padding: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.1rem' }}>容器日志</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setIsLogsOpen(false)}>关闭</button>
            </div>
            <div
              ref={logRef}
              style={{
                flex: 1, backgroundColor: '#0f172a', color: '#e2e8f0',
                fontFamily: 'monospace', padding: '1rem', overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem',
                lineHeight: '1.6'
              }}
            >
              {logsLoading ? (
                <div className="flex-center" style={{ height: '100%', gap: '0.5rem' }}>
                  <RotateCw className="animate-spin" size={20} />
                  <span>正在实时获取日志...</span>
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
        .col-name { width: auto; }
        .col-image { width: 200px; }
        .col-id { width: 120px; font-family: monospace; }
        .col-status { width: 120px; }
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
          .col-id, .col-image {
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
