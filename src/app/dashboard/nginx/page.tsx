"use client";

import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/lib/LanguageContext';
import { Server, Sparkles, Brain, Wand2, RotateCw } from 'lucide-react';

interface NginxSite {
  name: string;
  port: string;
  serverName: string;
  status: 'enabled' | 'disabled';
}

export default function NginxDashboard() {
  const { t, language, effectiveLang } = useLanguage();
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [pids, setPids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState('');

  const [showSudoPrompt, setShowSudoPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [sudoPassword, setSudoPassword] = useState('');

  const [sites, setSites] = useState<NginxSite[]>([]);
  const [editingSite, setEditingSite] = useState<string | null>(null);
  const [siteContent, setSiteContent] = useState('');
  const [siteLoading, setSiteLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const [binPath, setBinPath] = useState<string>('nginx');
  const [sitesDir, setSitesDir] = useState<string>('Unknown');
  const [hasMainConfig, setHasMainConfig] = useState(false);

  const [analysisResult, setAnalysisResult] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiDemand, setAiDemand] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const aiCacheRef = useRef<Record<string, string>>({});

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
        if (data.hasMainConfig) setHasMainConfig(true);
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

  useEffect(() => {
    setAnalysisResult('');
    setAiDemand('');
    setShowAiPanel(false);
  }, [editingSite]);

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
          setTestResult(`${effectiveLang === 'zh' ? '配置测试失败' : 'Test failed'}:\n${data.details || data.error}`);
          diagnoseError(data.details || data.error);
        }
      } else {
        if (data.success) {
          setTimeout(fetchStatus, 500);
        } else {
          alert(`${t.common.error}: ${data.details || data.error}`);
        }
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      if (!showSudoPrompt) {
        setActionLoading(null);
      }
    }
  };

  const diagnoseError = async (errorLog: string) => {
    if (!errorLog) return;

    const cacheKey = `error:${errorLog.slice(-500)}`;
    if (aiCacheRef.current[cacheKey]) {
      setAnalysisResult(aiCacheRef.current[cacheKey]);
      return;
    }

    setAnalysisResult(effectiveLang === 'zh' ? 'AI 正在诊断配置错误原因... 🪄' : 'AI is diagnosing the configuration error... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请作为 Nginx 专家，分析以下 Nginx 配置测试失败的错误日志。请用通俗易懂的${effectiveLang === 'zh' ? '中文' : '英文'}解释错误原因，并给出具体的修复建议。错误日志如下：\n\n${errorLog}`,
          systemPrompt: 'You are an expert Nginx administrator and software engineer specializing in Nginx configuration and troubleshooting.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      }
    } catch (e) {
      setAnalysisResult(t.common.error);
    }
  };

  const handleAiAnalyze = async () => {
    if (!siteContent || isAiAnalyzing || siteLoading) return;

    if (analysisResult) {
      setAnalysisResult('');
      return;
    }

    const cacheKey = `audit:${editingSite}:${siteContent}`;
    if (aiCacheRef.current[cacheKey]) {
      setAnalysisResult(aiCacheRef.current[cacheKey]);
      return;
    }

    setIsAiAnalyzing(true);
    setAnalysisResult(effectiveLang === 'zh' ? 'AI 正在深度审计该站点的 Nginx 配置... 🪄' : 'AI is auditing this Nginx config... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请作为资深 Nginx 专家，分析以下站点配置 "${editingSite}"。请从安全性（是否有漏洞隐患）、性能优化（缓存、压缩）、以及逻辑正确性三个维度进行评估，并给出优化建议。使用${effectiveLang === 'zh' ? '中文' : '英文'} Markdown 格式。配置内容如下：\n\n${siteContent}`,
          systemPrompt: 'You are an expert Nginx administrator specializing in security auditing and performance tuning.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else {
        setAnalysisResult(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setAnalysisResult(t.common.networkError);
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const handleAiEdit = async () => {
    if (!aiDemand.trim() || isAiEditing || siteLoading) return;

    setIsAiEditing(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请根据用户的需求修改现有的 Nginx 配置文件。\n现有内容如下：\n---\n${siteContent}\n---\n用户需求：${aiDemand}\n\n请直接返回修改后的完整 Nginx 配置代码，不要包含任何解释或 Markdown 代码块容器。`,
          systemPrompt: 'You are an expert Nginx configuration generator. You follow instructions precisely and output only the configuration text.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setSiteContent(data.data);
        setAiDemand('');
        setShowAiPanel(false);
        setSaveStatus(effectiveLang === 'zh' ? 'AI 已完成修改，请检查后保存' : 'AI completed changes, please review and save');
      } else {
        alert(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      setIsAiEditing(false);
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
    setSiteContent(t.common.loading);
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
        setSiteContent(`${t.common.error}: ${data.details || data.error}`);
      }
    } catch (e) {
      setSiteContent(t.common.networkError);
    }
  };

  const handleSaveSite = async () => {
    if (!editingSite) return;
    setSaveStatus(effectiveLang === 'zh' ? '保存中...' : 'Saving...');
    try {
      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write', filename: editingSite, content: siteContent }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus(t.common.saveSuccess);
        fetchSites();
        setTimeout(() => setSaveStatus(''), 2000);
      } else {
        setSaveStatus(`${t.common.saveFailed}: ${data.details || data.error}`);
      }
    } catch (e) {
      setSaveStatus(t.common.networkError);
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
        alert(`${t.common.error}: ${data.details || data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      setSiteLoading(false);
    }
  };

  const handleDeleteSite = async (filename: string) => {
    if (!window.confirm(t.common.deleteConfirm)) return;
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
        alert(`${t.common.error}: ${data.details || data.error}`);
      }
    } catch (e) {
      alert(t.common.networkError);
    } finally {
      setSiteLoading(false);
    }
  };

  const handleAddSite = () => {
    let filename = prompt(effectiveLang === 'zh' ? '请输入新站点的文件名 (例如 default.conf):' : 'Enter new site filename (e.g. default.conf):', 'new-site.conf');
    if (!filename) return;
    if (!filename.endsWith('.conf')) filename += '.conf';

    setEditingSite(filename);
    setSiteContent(`server {\n    listen 80;\n    server_name example.com;\n\n    location / {\n        root /var/www/html;\n        index index.html;\n    }\n}`);
    setSaveStatus('');
  };

  if (loading && isRunning === null) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid">
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Server size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>Nginx</h1>
        </div>
        <div className={`badge ${isRunning ? 'badge-success' : 'badge-danger'}`} style={{ height: 'fit-content' }}>
          {isRunning ? (effectiveLang === 'zh' ? '运行中' : 'Running') : (effectiveLang === 'zh' ? '已停止' : 'Stopped')}
        </div>
      </div>

      <div className="responsive-grid responsive-grid-auto">
        <div className="card glass-panel flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>{effectiveLang === 'zh' ? 'Nginx 进程 (PID)' : 'Nginx PIDs'}</h3>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {isRunning ? (pids.length > 0 ? pids.join(', ') : (effectiveLang === 'zh' ? '未知' : 'Unknown')) : (effectiveLang === 'zh' ? '无进程' : 'None')}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
              {effectiveLang === 'zh' ? '目标路径' : 'Bin Path'}: <code style={{ background: '#f1f5f9', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>{binPath}</code>
            </div>
          </div>
        </div>

        <div className="card glass-panel">
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>{effectiveLang === 'zh' ? '控制面板' : 'Control Panel'}</h3>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className={`btn ${isRunning ? 'btn-warning' : 'btn-success'}`}
              onClick={() => isRunning ? handleAction('restart') : handleAction('start')}
              disabled={actionLoading === 'restart' || actionLoading === 'start'}
            >
              {isRunning ? (effectiveLang === 'zh' ? '重启 Nginx' : 'Restart Nginx') : (effectiveLang === 'zh' ? '启动 Nginx' : 'Start Nginx')}
            </button>
            <button
              className="btn" style={{ background: '#f59e0b', color: 'white', flex: 1 }}
              onClick={() => handleAction('reload')}
              disabled={actionLoading === 'reload'}
            >
              {effectiveLang === 'zh' ? '重载配置' : 'Reload Config'}
            </button>
          </div>

          <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-surface-border)' }}>
            <button
              className="btn btn-ghost" style={{ width: '100%', border: '1px solid #e2e8f0' }}
              onClick={() => handleAction('test')}
              disabled={actionLoading === 'test'}
            >
              {effectiveLang === 'zh' ? '测试配置文件 (-t)' : 'Test Config (-t)'}
            </button>
          </div>
        </div>
      </div>

      <div className={`responsive-grid ${editingSite ? 'responsive-grid-2' : ''}`} style={{ transition: 'all 0.3s', marginTop: '1rem' }}>
        <div className="card glass-panel" style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <div className="flex-between">
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>{effectiveLang === 'zh' ? '站点管理' : 'Site Manager'} ({sitesDir})</h3>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {hasMainConfig && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem', border: '1px solid var(--color-surface-border)' }}
                  onClick={() => handleEditSite('nginx.conf')}
                >
                  {effectiveLang === 'zh' ? '主配置' : 'Main Config'}
                </button>
              )}
              <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={handleAddSite}>
                {effectiveLang === 'zh' ? '添加站点' : 'Add Site'}
              </button>
            </div>
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
                      {site.status === 'enabled' ? (effectiveLang === 'zh' ? '已启用' : 'Enabled') : (effectiveLang === 'zh' ? '已禁用' : 'Disabled')}
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
                    {site.status === 'enabled' ? (effectiveLang === 'zh' ? '禁用' : 'Disable') : (effectiveLang === 'zh' ? '启用' : 'Enable')}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: '#3b82f6', border: '1px solid #3b82f6' }} onClick={() => handleEditSite(site.name)}>{t.common.edit}</button>
                  <button className="btn btn-ghost" style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', color: '#ef4444', border: '1px solid #ef4444' }} onClick={() => handleDeleteSite(site.name)} disabled={siteLoading}>{t.common.delete}</button>
                </div>
              </li>
            ))}
            {sites.length === 0 && (
              <li style={{ padding: '1rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>{t.common.none}</li>
            )}
          </ul>
        </div>

        {editingSite && (
          <div className="card glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '600px' }}>
            <div className="flex-between" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h2 className="card-title" style={{ margin: 0, fontSize: '1.1rem' }}>{t.common.edit}: {editingSite}</h2>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleAiAnalyze}
                  disabled={siteLoading || isAiAnalyzing || !siteContent}
                  style={{ color: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.05)', height: '32px' }}
                >
                  <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isAiAnalyzing ? 'animate-pulse' : ''} />
                  {isAiAnalyzing ? (effectiveLang === 'zh' ? '分析中...' : 'Analyzing...') : t.common.aiAudit}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAiPanel(!showAiPanel)}
                  disabled={siteLoading || isAiEditing || !siteContent}
                  style={{ color: 'var(--color-primary)', background: 'rgba(59, 130, 246, 0.05)', height: '32px' }}
                >
                  <Wand2 size={14} style={{ marginRight: '0.4rem' }} />
                  {t.common.aiAdjust}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ height: '32px' }} onClick={() => setEditingSite(null)}>&times;</button>
              </div>
            </div>

            {showAiPanel && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.03)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.1)', animation: 'slideInDown 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                  <Wand2 size={14} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>AI Edit Assistant</span>
                </div>
                <input
                  className="input"
                  placeholder={effectiveLang === 'zh' ? "描述你想要进行的修改..." : "Describe your changes..."}
                  value={aiDemand}
                  onChange={(e) => setAiDemand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAiEdit()}
                  style={{ fontSize: '0.85rem' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAiPanel(false)}>{t.common.cancel}</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAiEdit} disabled={!aiDemand.trim() || isAiEditing}>
                    {isAiEditing ? (effectiveLang === 'zh' ? '处理中...' : 'Processing...') : (effectiveLang === 'zh' ? '应用修改' : 'Apply')}
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
                position: 'relative',
                overflow: 'hidden'
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
                  <Brain size={16} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Nginx Config Audit</span>
                  <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7, padding: '1.25rem', overflowY: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                </div>
              </div>
            )}

            <textarea
              className="input"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', padding: '1rem', resize: 'none', background: '#fafafa' }}
              value={siteContent}
              onChange={(e) => setSiteContent(e.target.value)}
            />

            <div className="flex-between" style={{ marginTop: '1rem' }}>
              <span className={saveStatus.includes('成功') || saveStatus.includes('Success') ? 'badge badge-success' : 'badge badge-warning'} style={{ opacity: saveStatus ? 1 : 0 }}>
                {saveStatus || 'Ready'}
              </span>
              <button className="btn btn-primary" onClick={handleSaveSite}>{t.common.save}</button>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {effectiveLang === 'zh' ? '保存后请点击“测试配置文件 (-t)”检查语法，然后点击“重载配置 (Reload)”使其生效。' : 'After saving, click "Test Config (-t)" and then "Reload Config".'}
            </div>
          </div>
        )}
      </div>

      {testResult && (
        <div className="card glass-panel" style={{ marginTop: '0.5rem' }}>
          <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>{effectiveLang === 'zh' ? '配置文件测试结果' : 'Config Test Result'}</h3>
          <div style={{
            background: '#f1f5f9', padding: '1rem', borderRadius: 'var(--radius-sm)',
            fontFamily: 'monospace', color: testResult.includes('failed') ? 'var(--color-danger)' : 'var(--color-success)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.85rem',
            border: '1px solid var(--color-surface-border)'
          }}>
            {testResult}
          </div>
        </div>
      )}

      {showSudoPrompt && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="card glass-panel" style={{ width: '90%', maxWidth: '400px' }}>
            <h2 className="card-title" style={{ marginTop: 0 }}>{effectiveLang === 'zh' ? '需要管理员权限' : 'Admin Required'}</h2>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {effectiveLang === 'zh' ? 'Nginx 进程配置受保护，继续此操作需要你的 Mac 开机密码。' : 'Nginx process is protected. Admin password required.'}
            </p>
            <form onSubmit={submitSudoAction}>
              <input
                type="password"
                className="input"
                style={{ width: '100%', marginBottom: '1rem' }}
                placeholder={effectiveLang === 'zh' ? "在此输入管理员密码" : "Enter admin password"}
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
                  {t.common.cancel}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t.common.confirm}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
