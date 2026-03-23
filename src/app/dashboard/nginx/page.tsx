"use client";

import Link from 'next/link';
import { useEffect, useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLanguage } from '@/lib/LanguageContext';
import { Server, Sparkles, Brain, Wand2, RotateCw, Shield } from 'lucide-react';
import SudoModal from '@/components/SudoModal';

interface NginxSite {
  name: string;
  port: string;
  serverName: string;
  status: 'enabled' | 'disabled';
}

export default function NginxDashboard() {
  const { t } = useLanguage();
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [pids, setPids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [testResult, setTestResult] = useState('');

  const [sudoModal, setSudoModal] = useState({ isOpen: false, isError: false });
  const [pendingAction, setPendingAction] = useState<{ type: 'service' | 'config', action: string, filename?: string } | null>(null);
  const [sudoPassword, setSudoPassword] = useState('');

  const [sites, setSites] = useState<NginxSite[]>([]);
  const [editingSite, setEditingSite] = useState<string | null>(null);
  const [siteContent, setSiteContent] = useState('');
  const [siteLoading, setSiteLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  const [nginxLogs, setNginxLogs] = useState('');
  const [logType, setLogType] = useState<'error' | 'access'>('error');
  const [logLoading, setLogLoading] = useState(false);
  const logTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [logAnalysisResult, setLogAnalysisResult] = useState('');
  const [isLogAnalyzing, setIsLogAnalyzing] = useState(false);

  const [binPath, setBinPath] = useState<string>('nginx');
  const [sitesDir, setSitesDir] = useState<string>('Unknown');
  const [hasMainConfig, setHasMainConfig] = useState(false);

  const [analysisResult, setAnalysisResult] = useState('');
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [aiDemand, setAiDemand] = useState('');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const aiCacheRef = useRef<Record<string, string>>({});

  const refreshInterval = 5000;
  const scrollLogsToBottom = useCallback(() => {
    if (logTextareaRef.current) {
      logTextareaRef.current.scrollTop = logTextareaRef.current.scrollHeight;
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
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
        setBinPath(data.binPath || '');
      }
    } catch {
      setIsRunning(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch(`/api/nginx/logs?type=${logType}&limit=1000`);
      const data = await res.json();
      if (data.success) {
        setNginxLogs(data.logs);
        setTimeout(scrollLogsToBottom, 100);
      } else {
        const errorMsg = (t.common.errors as Record<string, string>)[data.error] || data.details || data.error;
        setNginxLogs(`Error: ${errorMsg}`);
      }
    } catch {
      setNginxLogs('Failed to fetch logs');
    } finally {
      setLogLoading(false);
    }
  }, [logType, t.common.errors, scrollLogsToBottom]);

  const fetchSites = useCallback(async () => {
    try {
      const res = await fetch('/api/nginx/sites');
      const data = await res.json();
      if (data.success) {
        setSites(data.data || []);
        if (data.dir) setSitesDir(data.dir);
        if (data.hasMainConfig) setHasMainConfig(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSites();
  }, [fetchStatus, fetchSites]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const timer = setInterval(fetchLogs, refreshInterval);
    return () => clearInterval(timer);
  }, [fetchLogs, refreshInterval]);

  useEffect(() => {
    setAnalysisResult('');
    setAiDemand('');
    setShowAiPanel(false);
  }, [editingSite]);

  const handleAction = async (action: string, password?: string) => {
    if (!password) setActionLoading(action);
    if (action === 'test') setTestResult('');

    try {
      const payload: Record<string, unknown> = { action };
      if (password) payload.password = password;

      const res = await fetch('/api/nginx/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.requiresPassword || data.error === 'SUDO_REQUIRED') {
        setPendingAction({ type: 'service', action });
        setSudoModal({ isOpen: true, isError: false });
        setActionLoading(null);
        return;
      }

      if (data.error === 'SUDO_PASSWORD_INCORRECT' || data.error === 'password_incorrect') {
        setSudoModal({ isOpen: true, isError: true });
        setSudoPassword('');
        setActionLoading(null);
        return;
      }

      if (password) {
        setSudoModal({ isOpen: false, isError: false });
        setSudoPassword('');
        setPendingAction(null);
      }

      if (action === 'test') {
        if (data.success) {
          setTestResult(data.details || t.nginx.testSuccess);
        } else {
          setTestResult(`${t.nginx.testFailed}:\n${data.details || data.error}`);
          diagnoseError(data.details || data.error);
        }
      } else {
        if (data.success) {
          if (action === 'reload') {
            showToast(t.nginx.reloadSuccess, 'success');
          } else if (action === 'start') {
            showToast(t.common.success, 'success');
          } else if (action === 'stop') {
            showToast(t.common.success, 'success');
          }
          setTimeout(fetchStatus, 500);
        } else {
          showToast(`${t.common.error}: ${data.details || data.error}`, 'error');
        }
      }
    } catch (e) {
      showToast(t.common.networkError, 'error');
    } finally {
      if (!sudoModal.isOpen) {
        setActionLoading(null);
      }
    }
  };

  const handleAnalyzeLogs = async () => {
    if (!nginxLogs || isLogAnalyzing) return;

    const cacheKey = `logAnalysis:${logType}:${nginxLogs.slice(-2000)}`;
    if (aiCacheRef.current[cacheKey]) {
      setLogAnalysisResult(aiCacheRef.current[cacheKey]);
      return;
    }

    setIsLogAnalyzing(true);
    setLogAnalysisResult(t.nginx.aiAnalyzingLogs);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.nginx.aiLogPrompt
            .replace('{type}', logType === 'error' ? t.nginx.errorLog : t.nginx.accessLog)
            .replace('{logs}', nginxLogs.slice(-4000)),
          systemPrompt: 'You are an expert Nginx administrator specializing in system observation and troubleshooting.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setLogAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setLogAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      } else {
        setLogAnalysisResult(`${t.common.error}: ${data.error}`);
      }
    } catch (e) {
      setLogAnalysisResult(t.common.networkError);
    } finally {
      setIsLogAnalyzing(false);
    }
  };

  const diagnoseError = async (errorLog: string) => {
    if (!errorLog) return;

    const cacheKey = `error:${errorLog.slice(-500)}`;
    if (aiCacheRef.current[cacheKey]) {
      setAnalysisResult(aiCacheRef.current[cacheKey]);
      return;
    }

    setAnalysisResult(t.nginx.aiDiagnosing);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.nginx.aiErrorPrompt.replace('{errorLog}', errorLog),
          systemPrompt: 'You are an expert Nginx administrator and software engineer specializing in Nginx configuration and troubleshooting.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
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
    setAnalysisResult(t.nginx.aiAuditing);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: t.nginx.aiAuditPrompt
            .replace('{site}', editingSite || '')
            .replace('{content}', siteContent),
          systemPrompt: 'You are an expert Nginx administrator specializing in security auditing and performance tuning.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setAnalysisResult(data.data);
        aiCacheRef.current[cacheKey] = data.data;
      } else if (data.error === 'AI_CONFIG_MISSING') {
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
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
          prompt: t.nginx.aiEditPrompt
            .replace('{content}', siteContent)
            .replace('{demand}', aiDemand),
          systemPrompt: 'You are an expert Nginx configuration generator. You follow instructions precisely and output only the configuration text.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setSiteContent(data.data);
        setAiDemand('');
        setShowAiPanel(false);
        setSaveStatus(t.nginx.aiEditDone);
      } else if (data.error === 'AI_CONFIG_MISSING') {
        showToast(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`, 'error');
        setAnalysisResult(`${t.common.errors.aiConfigMissing}: ${t.common.errors.aiConfigMissingDetail}`);
      } else {
        showToast(`${t.common.error}: ${data.error}`, 'error');
      }
    } catch (e) {
      showToast(t.common.networkError, 'error');
    } finally {
      setIsAiEditing(false);
    }
  };

  const handleSudoSubmit = (password: string) => {
    setSudoPassword(password);
    if (!pendingAction) return;

    if (pendingAction.type === 'service') {
      handleAction(pendingAction.action, password);
    } else if (pendingAction.type === 'config') {
      if (pendingAction.action === 'write') {
        handleSaveSite(password);
      } else if (pendingAction.action === 'enable' || pendingAction.action === 'disable') {
        handleToggleStatus(pendingAction.filename!, pendingAction.action === 'enable' ? 'disabled' : 'enabled', password);
      } else if (pendingAction.action === 'delete') {
        handleDeleteSite(pendingAction.filename!, password);
      }
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

  const handleSaveSite = async (password?: string) => {
    if (!editingSite) return;
    setSaveStatus(t.common.saving);
    try {
      const payload: { action: string; filename: string; content: string; sudoPassword?: string } = { action: 'write', filename: editingSite, content: siteContent };
      if (password) payload.sudoPassword = password;

      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (data.error === 'SUDO_REQUIRED') {
        setPendingAction({ type: 'config', action: 'write' });
        setSudoModal({ isOpen: true, isError: false });
        setSaveStatus('');
        return;
      }

      if (data.error === 'SUDO_PASSWORD_INCORRECT') {
        setSudoModal({ isOpen: true, isError: true });
        setSudoPassword('');
        setSaveStatus(t.common.passwordIncorrect);
        return;
      }

      if (data.success) {
        setSudoModal({ isOpen: false, isError: false });
        setSudoPassword('');
        setPendingAction(null);
        setSaveStatus(t.common.saveSuccess);
        fetchSites();
        setTimeout(() => setSaveStatus(''), 2000);
        handleAction('test');
      } else {
        setSaveStatus(`${t.common.saveFailed}: ${data.details || data.error}`);
      }
    } catch (e) {
      setSaveStatus(t.common.networkError);
    }
  };

  const handleToggleStatus = async (filename: string, currentStatus: 'enabled' | 'disabled', password?: string) => {
    const action = currentStatus === 'enabled' ? 'disable' : 'enable';
    setSiteLoading(true);
    try {
      const payload: { action: string; filename: string; sudoPassword?: string } = { action, filename };
      if (password) payload.sudoPassword = password;

      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (data.error === 'SUDO_REQUIRED') {
        setPendingAction({ type: 'config', action, filename });
        setSudoModal({ isOpen: true, isError: false });
        return;
      }

      if (data.error === 'SUDO_PASSWORD_INCORRECT') {
        setSudoModal({ isOpen: true, isError: true });
        setSudoPassword('');
        return;
      }

      if (data.success) {
        setSudoModal({ isOpen: false, isError: false });
        setSudoPassword('');
        setPendingAction(null);
        fetchSites();
      } else {
        showToast(`${t.common.error}: ${data.details || data.error}`, 'error');
      }
    } catch (e) {
      showToast(t.common.networkError, 'error');
    } finally {
      setSiteLoading(false);
    }
  };

  const handleDeleteSite = async (filename: string, password?: string) => {
    if (!password && !window.confirm(t.common.deleteConfirm)) return;
    setSiteLoading(true);
    try {
      const payload: { action: string; filename: string; sudoPassword?: string } = { action: 'delete', filename };
      if (password) payload.sudoPassword = password;

      const res = await fetch('/api/nginx/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      
      if (data.error === 'SUDO_REQUIRED') {
        setPendingAction({ type: 'config', action: 'delete', filename });
        setSudoModal({ isOpen: true, isError: false });
        return;
      }

      if (data.error === 'SUDO_PASSWORD_INCORRECT') {
        setSudoModal({ isOpen: true, isError: true });
        setSudoPassword('');
        return;
      }

      if (data.success) {
        setSudoModal({ isOpen: false, isError: false });
        setSudoPassword('');
        setPendingAction(null);
        fetchSites();
        if (editingSite === filename) setEditingSite(null);
      } else {
        showToast(`${t.common.error}: ${data.details || data.error}`, 'error');
      }
    } catch (e) {
      showToast(t.common.networkError, 'error');
    } finally {
      setSiteLoading(false);
    }
  };

  const handleAddSite = () => {
    let filename = prompt(t.nginx.newSitePrompt, 'new-site.conf');
    if (!filename) return;
    if (!filename.endsWith('.conf')) filename += '.conf';

    setEditingSite(filename);
    setSiteContent(`server {\n    listen 80;\n    server_name example.com;\n\n    location / {\n        root /var/www/html;\n        index index.html;\n    }\n}`);
    setSaveStatus('');
  };

  if (loading && isRunning === null) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid no-scrollbar" style={{ overflowY: 'hidden', height: 'calc(100vh - 24px)', display: 'flex', flexDirection: 'column' }}>
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? 'var(--color-danger)' : toast.type === 'success' ? 'var(--color-success)' : 'var(--color-primary)',
          color: 'white', padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          zIndex: 9999, transition: 'all 0.3s', animation: 'slideInDown 0.3s ease',
          fontSize: '0.9rem', fontWeight: 500
        }}>
          {toast.message}
        </div>
      )}
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Server size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>Nginx</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {binPath && (
            <div className="desktop-only" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{t.nginx.binPath}:</span>
              <code style={{
                background: 'var(--color-surface-bg)',
                padding: '0.15rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-surface-border)',
                color: 'var(--color-text)',
                fontSize: '0.75rem',
                fontFamily: 'monospace'
              }}>
                {binPath}
              </code>
            </div>
          )}
          <div className={`badge ${isRunning ? 'badge-success' : 'badge-danger'}`} style={{ height: 'fit-content' }}>
            {isRunning ? t.nginx.running : t.nginx.stopped}
          </div>
        </div>
      </div>

      <div className="responsive-grid responsive-grid-2" style={{ flexShrink: 0, marginBottom: '0.4rem' }}>
        {/* Left column: Process & Control */}
        <div className="card glass-panel flex-column" style={{ height: '220px' }}>
          <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>{t.nginx.controlPanel}</h3>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {t.nginx.pids}: <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{isRunning ? (pids.length > 0 ? pids.join(', ') : t.common.unknown) : t.common.none}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                className="btn btn-success"
                onClick={() => handleAction('start')}
                disabled={actionLoading === 'start' || isRunning === true}
              >
                {t.nginx.start}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleAction('stop')}
                disabled={actionLoading === 'stop' || isRunning === false}
              >
                {t.nginx.stop}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <button
                className="btn btn-warning"
                onClick={() => handleAction('restart')}
                disabled={actionLoading === 'restart'}
              >
                {t.nginx.restart}
              </button>
              <button
                className="btn btn-info"
                onClick={() => handleAction('reload')}
                disabled={actionLoading === 'reload'}
              >
                {t.nginx.reload}
              </button>
            </div>

            <button
              className="btn btn-ghost" style={{ width: '100%', border: '1px solid var(--color-surface-border)' }}
              onClick={() => handleAction('test')}
              disabled={actionLoading === 'test'}
            >
              {t.nginx.test}
            </button>
          </div>

          {testResult && (
            <div style={{
              marginTop: '-1rem', background: 'var(--color-surface-bg)', padding: '0.75rem', borderRadius: 'var(--radius-sm)',
              fontFamily: 'monospace', color: testResult.includes('failed') || testResult.includes('失败') ? 'var(--color-danger)' : 'var(--color-success)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem',
              border: '1px solid var(--color-surface-border)', maxHeight: '120px', overflowY: 'auto', flex: 1
            }}>
              {testResult}
            </div>
          )}


        </div>

        {/* Right column: Log Viewer */}
        <div className="card glass-panel" style={{ height: '220px', display: 'flex', flexDirection: 'column' }}>
          <div className="flex-between" style={{ marginBottom: '0.75rem' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>{t.nginx.logsTitle}</h3>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={handleAnalyzeLogs}
                disabled={isLogAnalyzing || !nginxLogs}
                style={{ color: 'var(--color-success)', background: 'var(--color-primary-light)', fontSize: '0.7rem' }}
              >
                <Sparkles size={12} style={{ marginRight: '0.3rem' }} />
                {t.nginx.aiAnalyzeLogs}
              </button>
              <div className="tabs" style={{ background: 'var(--color-surface-bg)', padding: '0.2rem', borderRadius: 'var(--radius-md)', display: 'flex', gap: '0.2rem', border: '1px solid var(--color-surface-border)' }}>
                <button
                  onClick={() => setLogType('error')}
                  style={{
                    padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)',
                    backgroundColor: logType === 'error' ? 'var(--color-bg)' : 'transparent',
                    color: logType === 'error' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    border: 'none', cursor: 'pointer'
                  }}
                >
                  {t.nginx.errorLog}
                </button>
                <button
                  onClick={() => setLogType('access')}
                  style={{
                    padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)',
                    backgroundColor: logType === 'access' ? 'var(--color-bg)' : 'transparent',
                    color: logType === 'access' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    border: 'none', cursor: 'pointer'
                  }}
                >
                  {t.nginx.accessLog}
                </button>
              </div>
            </div>
          </div>
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {logAnalysisResult && (
              <div className="ai-output-block" style={{
                padding: '0.75rem', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-surface-border)', maxHeight: '100px', overflowY: 'auto', marginBottom: '0.5rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem', color: 'var(--color-success)', fontWeight: 600, fontSize: '0.75rem' }}>
                  <Brain size={14} /> {t.nginx.logAnalysisResult}
                  <button onClick={() => setLogAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>&times;</button>
                </div>
                <div style={{ fontSize: '0.75rem', lineHeight: 1.5 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{logAnalysisResult}</ReactMarkdown>
                  {logAnalysisResult.includes(t.common.errors.aiConfigMissing) && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div style={{ position: 'relative', flex: 1 }}>
              <textarea
                ref={logTextareaRef}
                readOnly
                value={nginxLogs}
                style={{
                  width: '100%', height: '100%', background: 'var(--color-surface-bg)', color: 'var(--color-text)',
                  padding: '0.75rem', borderRadius: 'var(--radius-sm)', fontFamily: 'monospace',
                  fontSize: '0.75rem', resize: 'none', border: '1px solid var(--color-surface-border)',
                  whiteSpace: 'pre-wrap', overflowX: 'auto'
                }}
              />
              <button
                onClick={() => fetchLogs()}
                className="btn btn-ghost"
                style={{
                  position: 'absolute', bottom: '10px', right: '20px',
                  backgroundColor: 'var(--color-surface-bg)', color: 'var(--color-text)',
                  padding: '0.4rem', borderRadius: '50%', minWidth: 'auto', width: '32px', height: '32px', zIndex: 10
                }}
                title={t.common.refresh}
              >
                <RotateCw size={14} className={logLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className={`responsive-grid ${editingSite ? 'responsive-grid-2' : ''}`} style={{ transition: 'all 0.3s', marginTop: '0.5rem', flex: 1, minHeight: 0 }}>
        <div className="card glass-panel" style={{ height: '100%', overflowY: 'auto' }}>
          <div className="flex-between" style={{ position: 'sticky', top: 0, backgroundColor: 'var(--color-bg)', zIndex: 10, padding: '1rem', margin: '-1rem -1rem 1rem -1rem', borderBottom: '1px solid var(--color-surface-border)' }}>
            <h3 style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', margin: 0 }}>{t.nginx.siteManager} ({sitesDir})</h3>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {hasMainConfig && (
                <button
                  className="btn btn-info"
                  style={{ padding: '0.35rem 0.8rem', fontSize: '0.85rem', boxShadow: '0 4px 10px rgba(59, 130, 246, 0.2)' }}
                  onClick={() => handleEditSite('nginx.conf')}
                >
                  {t.nginx.mainConfig}
                </button>
              )}
              <button className="btn btn-primary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }} onClick={handleAddSite}>
                {t.nginx.addSite}
              </button>
            </div>
          </div>

          <ul style={{ listStyle: 'none', padding: 0, margin: 0, marginTop: '1rem' }}>
            {sites.map(site => (
              <li key={site.name} style={{
                padding: '0.75rem', borderBottom: '1px solid var(--color-surface-border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: editingSite === site.name ? 'var(--color-primary-light)' : 'var(--color-surface-bg)',
                borderRadius: 'var(--radius-sm)'
              }}>
                <div>
                  <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {site.name}
                    <span className={`badge ${site.status === 'enabled' ? 'badge-success' : 'badge-ghost'}`} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                      {site.status === 'enabled' ? t.common.enabled : t.common.disabled}
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
                    {site.status === 'enabled' ? t.common.disableTitle : t.common.enableTitle}
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
                  style={{ color: 'var(--color-success)', background: 'var(--color-primary-light)', height: '32px' }}
                >
                  <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isAiAnalyzing ? 'animate-pulse' : ''} />
                  {isAiAnalyzing ? t.common.analyzing : t.nginx.aiAudit}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowAiPanel(!showAiPanel)}
                  disabled={siteLoading || isAiEditing || !siteContent}
                  style={{ color: 'var(--color-primary)', background: 'var(--color-primary-light)', height: '32px' }}
                >
                  <Wand2 size={14} style={{ marginRight: '0.4rem' }} />
                  {t.common.aiAdjust}
                </button>
                <button className="btn btn-ghost btn-sm" style={{ height: '32px' }} onClick={() => setEditingSite(null)}>&times;</button>
              </div>
            </div>

            {showAiPanel && (
              <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-surface-border)', animation: 'slideInDown 0.3s ease', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
                  <Wand2 size={14} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{t.nginx.aiEditAssistant}</span>
                </div>
                <textarea
                  className="input"
                  placeholder={t.nginx.aiProcessPlaceholder}
                  value={aiDemand}
                  onChange={(e) => setAiDemand(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAiEdit();
                    }
                  }}
                  style={{ fontSize: '0.85rem', minHeight: '80px', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAiPanel(false)}>{t.common.cancel}</button>
                  <button className="btn btn-primary btn-sm" onClick={handleAiEdit} disabled={!aiDemand.trim() || isAiEditing}>
                    {isAiEditing ? t.nginx.aiApplyRunning : t.nginx.aiApply}
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
                  background: 'var(--color-surface-bg)',
                  backdropFilter: 'blur(8px)',
                  zIndex: 5,
                  borderBottom: '1px solid var(--color-surface-border)'
                }}>
                  <Brain size={16} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Nginx Config Audit</span>
                  <button onClick={() => setAnalysisResult('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7, padding: '1.25rem', overflowY: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisResult}</ReactMarkdown>
                  {analysisResult.includes(t.common.errors.aiConfigMissing) && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <Link href="/dashboard/settings" className="btn btn-primary btn-sm">{t.common.goToSettings}</Link>
                    </div>
                  )}
                </div>
              </div>
            )}

            <textarea
              className="input"
              style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85rem', padding: '1rem', resize: 'none', background: 'var(--color-surface-bg)', color: 'var(--color-text)', border: '1px solid var(--color-surface-border)', borderRadius: 'var(--radius-sm)' }}
              value={siteContent}
              onChange={(e) => setSiteContent(e.target.value)}
            />

            <div className="flex-between" style={{ marginTop: '1rem' }}>
              <span className={saveStatus.includes('成功') || saveStatus.includes('Success') ? 'badge badge-success' : 'badge badge-warning'} style={{ opacity: saveStatus ? 1 : 0 }}>
                {saveStatus || 'Ready'}
              </span>
              <button className="btn btn-primary" onClick={() => handleSaveSite()}>{t.common.save}</button>
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              {t.nginx.saveNote}
            </div>
          </div>
        )}
      </div>

      <SudoModal 
        isOpen={sudoModal.isOpen}
        isError={sudoModal.isError}
        onClose={() => {
          setSudoModal({ isOpen: false, isError: false });
          if (!sudoModal.isError) {
             setPendingAction(null);
          }
        }}
        onSubmit={handleSudoSubmit}
      />
    </div>
  );
}
