"use client";

import { useEffect, useState } from 'react';
import { Play, Square, RotateCw, Trash2, FileText, Server, HardDrive } from 'lucide-react';

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
      <div className="flex-between">
        <h1 className="card-title" style={{ fontSize: '1.75rem', margin: 0 }}>Docker 管理 🐳</h1>
        <button className="btn btn-primary" onClick={fetchData}>刷新</button>
      </div>

      {error && (
        <div className="badge badge-danger" style={{ display: 'block', padding: '1rem', borderRadius: '8px' }}>
          {error}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid var(--color-surface-border)' }}>
        <button
          className={`btn ${activeTab === 'containers' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('containers')}
          style={{ borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Server size={18} /> 容器管理
        </button>
        <button
          className={`btn ${activeTab === 'images' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('images')}
          style={{ borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <HardDrive size={18} /> 镜像管理
        </button>
      </div>

      <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            {activeTab === 'containers' ? '总容器数' : '总镜像数'}
          </h3>
          <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>
            {activeTab === 'containers' ? containers.length : images.length}
          </div>
          {activeTab === 'containers' && (
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              运行中: {containers.filter(c => c.Status.includes('Up')).length}
            </div>
          )}
        </div>
        <div className={`badge ${!error ? 'badge-success' : 'badge-danger'}`}>
          {!error ? 'Docker 服务正常' : 'Docker 服务异常'}
        </div>
      </div>

      <div className="card glass-panel" style={{ overflowX: 'auto' }}>
        {activeTab === 'containers' ? (
          <table key="table-containers" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>名称</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>ID</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>镜像</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>状态</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {containers.map((c) => {
                const isUp = c.Status.startsWith('Up');
                return (
                  <tr key={c.ID} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={{ padding: '0.75rem', fontSize: '0.95rem', fontWeight: 500 }}>{c.Names}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{c.ID.substring(0, 8)}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{c.Image}</td>
                    <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                      <span className={`badge ${isUp ? 'badge-success' : 'badge-danger'}`}>
                        {c.Status}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', fontSize: '0.9rem', display: 'flex', gap: '0.5rem' }}>
                      {isUp ? (
                        <>
                          <button
                            className="btn btn-ghost" style={{ padding: '0.4rem', color: '#f59e0b', border: '1px solid #f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => handleAction(c.ID, 'restart')} disabled={actionLoading === `${c.ID}-restart`} title="重启"
                          ><RotateCw size={16} /></button>
                          <button
                            className="btn btn-ghost" style={{ padding: '0.4rem', color: '#ef4444', border: '1px solid #ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => handleAction(c.ID, 'stop')} disabled={actionLoading === `${c.ID}-stop`} title="停止"
                          ><Square size={16} /></button>
                        </>
                      ) : (
                        <>
                          <button
                            className="btn btn-ghost" style={{ padding: '0.4rem', color: '#10b981', border: '1px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => handleAction(c.ID, 'start')} disabled={actionLoading === `${c.ID}-start`} title="启动"
                          ><Play size={16} /></button>
                          <button
                            className="btn btn-ghost" style={{ padding: '0.4rem', color: '#64748b', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={() => { if (window.confirm('确定要删除此容器吗？')) handleAction(c.ID, 'rm'); }} disabled={actionLoading === `${c.ID}-rm`} title="删除"
                          ><Trash2 size={16} /></button>
                        </>
                      )}
                      <button
                        className="btn btn-ghost" style={{ padding: '0.4rem', color: '#3b82f6', border: '1px solid #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => showLogs(c.ID)} title="日志"
                      ><FileText size={16} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table key="table-images" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-surface-border)' }}>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>仓库名</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>标签</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>ID</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>大小</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>创建于</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>状态</th>
                <th style={{ padding: '0.75rem', color: 'var(--color-text-muted)' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {images.map((img) => (
                <tr key={img.ID} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <td style={{ padding: '0.75rem', fontSize: '0.95rem', fontWeight: 500 }}>{img.Repository}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                    <span className="badge badge-warning">{img.Tag}</span>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{img.ID}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>{img.Size}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>{img.CreatedAt.split(' ')[0]}</td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                    <span className={`badge ${img.InUse ? 'badge-primary' : 'badge-ghost'}`}>
                      {img.InUse ? '使用中' : '未使用'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem', fontSize: '0.9rem' }}>
                    {!img.InUse && (
                      <button
                        className="btn btn-ghost" style={{ padding: '0.4rem', color: '#ef4444', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={() => { if (window.confirm('确定要删除此镜像吗？')) handleAction(img.ID, 'rmi'); }} disabled={actionLoading === `${img.ID}-rmi`} title="删除"
                      ><Trash2 size={16} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {((activeTab === 'containers' && containers.length === 0) || (activeTab === 'images' && images.length === 0)) && !loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>没有找到任何数据</div>
        )}
      </div>

      {/* Logs Modal */}
      {isLogsOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="card glass-panel" style={{ width: '80%', height: '80%', display: 'flex', flexDirection: 'column' }}>
            <div className="flex-between" style={{ borderBottom: '1px solid var(--color-surface-border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem' }}>容器日志</h2>
              <button className="btn btn-ghost" onClick={() => setIsLogsOpen(false)}>关闭</button>
            </div>
            <div style={{
              flex: 1, backgroundColor: '#1e293b', color: '#10b981',
              fontFamily: 'monospace', padding: '1rem', overflowY: 'auto',
              borderRadius: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>
              {logsLoading ? '加载日志中...' : currentLogs}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
