"use client";

import { useEffect, useState } from 'react';

interface NginxSite {
  name: string;
  port: string;
  serverName: string;
  status: 'enabled' | 'disabled';
}

export default function NginxDashboard() {
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [pids, setPids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState('');

  // Sudo dialog state
  const [showSudoPrompt, setShowSudoPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [sudoPassword, setSudoPassword] = useState('');

  const [sites, setSites] = useState<NginxSite[]>([]);
  const [editingSite, setEditingSite] = useState<string | null>(null);
  const [siteContent, setSiteContent] = useState('');
  const [siteLoading, setSiteLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const [binPath, setBinPath] = useState<string>('nginx');
  const [sitesDir, setSitesDir] = useState<string>('未知');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/nginx/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'status' }),
      });
      const data = await res.json();
      if (data.success) {
        setIsRunning(data.running);
        setPids(data.pids || []);
        if (data.binPath) setBinPath(data.binPath);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/nginx/sites');
      const data = await res.json();
      if (data.success) {
        setSites(data.data || []);
        if (data.dir) setSitesDir(data.dir);
      }
    } catch (e) {
      console.error('获取站点列表失败', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchSites();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: string, password?: string) => {
    if (!password) setActionLoading(action);
    setTestResult('');

    try {
      const payload: Record<string, unknown> = { action };
      if (password) payload.password = password;

      const res = await fetch('/api/nginx/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.requiresPassword) {
        setPendingAction(action);
        setShowSudoPrompt(true);
        setActionLoading(null);
        return;
      }

      if (password) {
        setShowSudoPrompt(false);
        setSudoPassword('');
        setPendingAction(null);
      }

      if (action === 'test') {
        if (data.success) {
          setTestResult(data.details);
        } else {
          setTestResult(`配置测试失败:\n${data.details || data.error}`);
        }
      } else {
        if (data.success) {
          setTimeout(fetchStatus, 500);
        } else {
          alert(`操作失败: ${data.details || data.error}`);
        }
      }
    } catch (e) {
      alert('网络请求失败');
    } finally {
      if (!showSudoPrompt) {
        setActionLoading(null);
      }
    }
  };

  const submitSudoAction = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingAction && sudoPassword) {
      handleAction(pendingAction, sudoPassword);
    }
  };

  const handleEditSite = async (filename: string) => {
    setEditingSite(filename);
    setSiteContent('加载中...');
    setSaveStatus('');
    try {
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read', filename }),
      });
      const data = await res.json();
      if (data.success) {
        setSiteContent(data.content);
      } else {
        setSiteContent(`读取失败: ${data.details || data.error}`);
      }
    } catch (e) {
      setSiteContent('网络请求失败');
    }
  };

  const handleSaveSite = async () => {
    if (!editingSite) return;
    setSaveStatus('保存中...');
    try {
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', filename: editingSite, content: siteContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus('保存成功!');
        fetchSites();
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus(`保存失败: ${data.details || data.error}`);
      }
    } catch (e) {
      setSaveStatus('网络请求失败');
    }
  };

  const handleToggleStatus = async (filename: string, currentStatus: 'enabled' | 'disabled') => {
    const action = currentStatus === 'enabled' ? 'disable' : 'enable';
    setSiteLoading(true);
    try {
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, filename }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSites();
      } else {
        alert(`${action === 'enable' ? '启用' : '禁用'}失败: ${data.details || data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    } finally {
      setSiteLoading(false);
    }
  };

  const handleDeleteSite = async (filename: string) => {
    if (!window.confirm(`确定要删除站点配置 ${filename} 吗？`)) return;
    setSiteLoading(true);
    try {
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', filename }),
      });
      const data = await res.json();
      if (data.success) {
        fetchSites();
        if (editingSite === filename) setEditingSite(null);
      } else {
        alert(`删除失败: ${data.details || data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    } finally {
      setSiteLoading(false);
    }
  };

  const handleAddSite = () => {
    let filename = prompt('请输入新站点的文件名 (例如 default.conf):', 'new-site.conf');
    if (!filename) return;
    if (!filename.endsWith('.conf')) filename += '.conf';

    setEditingSite(filename);
    setSiteContent(`server {\n    listen 80;\n    server_name example.com;\n\n    location / {\n        root /var/www/html;\n        index index.html;\n    }\n}`);
    setSaveStatus('');
  };

  if (loading && isRunning === null) return <div className="flex-center" style={{ height: '70vh' }}>加载中...</div>;

  return (
    <div className="grid">
      <div className="flex-between">
        <h1 className="card-title" style={{ fontSize: '1.75rem', margin: 0 }}>Nginx 管理 🌐</h1>
        <div className={`badge ${isRunning ? 'badge-success' : 'badge-danger'}`}>
          {isRunning ? '运行中' : '已停止'}
        </div>
      </div>

      <div className="responsive-grid responsive-grid-auto">

        {/* Status Card */}
        <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Nginx 进程 (PID)</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {isRunning ? (pids.length > 0 ? pids.join(', ') : '未知') : '无进程'}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              目标路径: <code style={{ background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>{binPath}</code>
            </div>
          </div>
        </div>

        {/* Control Card */}
        <div className="card glass-panel">
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>控制面板</h3>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {isRunning ? (
              <>
                <button
                  className="btn" style={{ background: '#ef4444', color: 'white', flex: 1 }}
                  onClick={() => handleAction('stop')}
                  disabled={actionLoading === 'stop'}
                >
                  停止服务
                </button>
                <button
                  className="btn" style={{ background: '#f59e0b', color: 'white', flex: 1 }}
                  onClick={() => handleAction('reload')}
                  disabled={actionLoading === 'reload'}
                >
                  重载配置 (Reload)
                </button>
              </>
            ) : (
              <button
                className="btn" style={{ background: '#10b981', color: 'white', flex: 1 }}
                onClick={() => handleAction('start')}
                disabled={actionLoading === 'start'}
              >
                启动服务
              </button>
            )}
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-surface-border)' }}>
            <button
              className="btn btn-ghost" style={{ width: '100%', border: '1px solid #e2e8f0' }}
              onClick={() => handleAction('test')}
              disabled={actionLoading === 'test'}
            >
              测试配置文件 (-t)
            </button>
          </div>
        </div>

      </div>

      <div className={`responsive-grid ${editingSite ? 'responsive-grid-2' : ''}`} style={{ transition: 'all 0.3s', marginTop: '1rem' }}>
        <div className="card glass-panel" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <div className="flex-between">
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>站点管理 ({sitesDir})</h3>
            <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={handleAddSite}>
              添加站点
            </button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginTop: '1rem' }}>
            {sites.map(site => (
              <li key={site.name} style={{
                padding: '0.75rem', borderBottom: '1px solid rgba(0,0,0,0.05)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: editingSite === site.name ? 'var(--color-primary-light)' : 'transparent',
                borderRadius: 'var(--radius-sm)'
              }}>
                <div>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {site.name}
                    <span className={`badge ${site.status === 'enabled' ? 'badge-success' : 'badge-ghost'}`} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                      {site.status === 'enabled' ? '已启用' : '已禁用'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                    Port: {site.port} | {site.serverName}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-ghost"
                    style={{
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.8rem',
                      color: site.status === 'enabled' ? '#f59e0b' : '#10b981',
                      border: `1px solid ${site.status === 'enabled' ? '#f59e0b' : '#10b981'}`
                    }}
                    onClick={() => handleToggleStatus(site.name, site.status)}
                    disabled={siteLoading}
                  >
                    {site.status === 'enabled' ? '禁用' : '启用'}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: '#3b82f6', border: '1px solid #3b82f6' }} onClick={() => handleEditSite(site.name)}>编辑</button>
                  <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: '#ef4444', border: '1px solid #ef4444' }} onClick={() => handleDeleteSite(site.name)} disabled={siteLoading}>删除</button>
                </div>
              </li>
            ))}
            {sites.length === 0 && (
              <li style={{ padding: '1rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>没有配置任何站点</li>
            )}
          </ul>
        </div>

        {editingSite && (
          <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '400px' }}>
            <div className="flex-between" style={{ marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0, fontSize: '1.1rem' }}>编辑: {editingSite}</h2>
              <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setEditingSite(null)}>关闭</button>
            </div>

            <textarea
              className="input"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', padding: '1rem', resize: 'none', background: '#fafafa' }}
              value={siteContent}
              onChange={(e) => setSiteContent(e.target.value)}
            />

            <div className="flex-between" style={{ marginTop: '1rem' }}>
              <span className={saveStatus.includes('成功') ? 'badge badge-success' : saveStatus.includes('失败') ? 'badge badge-danger' : 'badge badge-warning'} style={{ opacity: saveStatus ? 1 : 0 }}>
                {saveStatus || 'Ready'}
              </span>
              <button className="btn btn-primary" onClick={handleSaveSite}>保存修改</button>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              保存后请点击“测试配置文件 (-t)”检查语法，然后点击“重载配置 (Reload)”使其生效。
            </div>
          </div>
        )}
      </div>

      {testResult && (
        <div className="card glass-panel" style={{ marginTop: '0.5rem' }}>
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>配置文件测试结果</h3>
          <div style={{
            background: '#1e293b', padding: '1rem', borderRadius: 'var(--radius-sm)',
            fontFamily: 'monospace', color: testResult.includes('failed') ? '#ef4444' : '#10b981',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem'
          }}>
            {testResult}
          </div>
        </div>
      )}

      {/* Sudo Password Prompt Dialog */}
      {showSudoPrompt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="card glass-panel" style={{ width: '90%', maxWidth: '400px' }}>
            <h2 className="card-title" style={{ marginTop: 0 }}>需要管理员权限</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              Nginx 进程配置受保护，继续此操作需要你的 Mac 开机密码。该密码仅用于单次命令执行。
            </p>
            <form onSubmit={submitSudoAction}>
              <input
                type="password"
                className="input"
                style={{ width: '100%', marginBottom: '1rem' }}
                placeholder="在此输入管理员密码"
                value={sudoPassword}
                onChange={e => setSudoPassword(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setShowSudoPrompt(false); setSudoPassword(''); setPendingAction(null); }}
                >
                  取消
                </button>
                <button type="submit" className="btn btn-primary">
                  确认执行
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
