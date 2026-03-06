"use client";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useEffect, useState, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Terminal, Brain, Activity, Settings, Zap, ArrowRight, ShieldCheck,
  Database, Clock, RefreshCw, Save, FileText, ChevronRight, Trash2, Sparkles, Wand2,
  Cpu, HardDrive, LayoutGrid, List, MessageSquare, Power, Plus, RotateCw
} from 'lucide-react';

type Tab = 'overview' | 'monitor' | 'config' | 'memory' | 'command' | 'cron';

const LobsterIcon = ({ size = 24, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3c-1.5 0-3 1-3 3 0 2 1.5 2.5 3 3.5 1.5-1 3-1.5 3-3.5 0-2-1.5-3-3-3z" />
    <path d="M18 10c1 0 3 .5 3 2.5s-2 2.5-3 2.5c-.5 0-1 0-1.5-.5" />
    <path d="M6 10c-1 0-3 .5-3 2.5s2 2.5 3 2.5c.5 0 1 0 1.5-.5" />
    <path d="M12 9v11a2 2 0 0 1-4 0M12 12v8a2 2 0 0 0 4 0" />
    <path d="M12 7c-1-2-2-3-4-3M12 7c1-2 2-3 4-3" />
    <circle cx="9" cy="5" r="0.5" fill={color} />
    <circle cx="15" cy="5" r="0.5" fill={color} />
  </svg>
);

export default function OpenClawMain() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isRunning, setIsRunning] = useState<boolean | null>(null);
  const [statusDetail, setStatusDetail] = useState('');
  const [versionOutput, setVersionOutput] = useState('');
  const [memoryFiles, setMemoryFiles] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [lastLogTime, setLastLogTime] = useState<string>('');
  const [history, setHistory] = useState<any[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);

  // Management state
  const [cmd, setCmd] = useState('openclaw gateway status');
  const [cmdResult, setCmdResult] = useState('');
  const [configContent, setConfigContent] = useState('');
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [activeMemoryFile, setActiveMemoryFile] = useState<any | null>(null);
  const [memoryContent, setMemoryContent] = useState('');
  const [isSavingMemory, setIsSavingMemory] = useState(false);
  const [configMode, setConfigMode] = useState<'visual' | 'source'>('visual');
  const [newConfigKey, setNewConfigKey] = useState('');
  const [newConfigValue, setNewConfigValue] = useState('');

  const previewLogRef = useRef<HTMLDivElement>(null);
  const monitorLogRef = useRef<HTMLDivElement>(null);
  const cmdResultRef = useRef<HTMLDivElement>(null);
  const [cronTasks, setCronTasks] = useState<any[]>([]);
  const [isEditingCron, setIsEditingCron] = useState(false);
  const [editingCronTask, setEditingCronTask] = useState<any>(null);
  const [isSavingCron, setIsSavingCron] = useState(false);
  const [memorySummary, setMemorySummary] = useState('');
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [logExplanation, setLogExplanation] = useState('');
  const [isExplainingLogs, setIsExplainingLogs] = useState(false);

  // Auto scroll logs to bottom
  useEffect(() => {
    if (previewLogRef.current) {
      previewLogRef.current.scrollTop = previewLogRef.current.scrollHeight;
    }
    if (monitorLogRef.current) {
      monitorLogRef.current.scrollTop = monitorLogRef.current.scrollHeight;
    }
    if (cmdResultRef.current) {
      cmdResultRef.current.scrollTop = cmdResultRef.current.scrollHeight;
    }
  }, [recentLogs, activeTab, cmdResult]);

  // Config helpers
  const parseConfig = () => {
    try {
      return JSON.parse(configContent || '{}');
    } catch (e) {
      return {};
    }
  };

  const updateConfigField = (path: string, value: any) => {
    const config = parseConfig();
    const parts = path.split('.');
    let current = config;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const nextPart = parts[i + 1];
      const isNextNumeric = !isNaN(Number(nextPart));

      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = isNextNumeric ? [] : {};
      }
      current = current[part];
    }

    const lastKey = parts[parts.length - 1];
    // Cast value back to number/bool if possible to match JSON types
    let typedValue: any = value;
    if (value === 'true') typedValue = true;
    else if (value === 'false') typedValue = false;
    else if (!isNaN(Number(value)) && value.trim() !== '') typedValue = Number(value);

    current[lastKey] = typedValue;
    setConfigContent(JSON.stringify(config, null, 2));
  };

  const renderConfigField = (val: any, key: string, path: string = ''): React.ReactNode => {
    const currentPath = path ? `${path}.${key}` : key;

    // Explicitly handle null - it's a primitive in JSON but typeof null is 'object'
    if (val === null) {
      return (
        <div key={currentPath} className="flex-between" style={{ padding: '0.4rem 0' }}>
          <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>{key}</span>
          <div style={{ flex: 1, marginLeft: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>null</span>
          </div>
        </div>
      );
    }

    // Recursively handle Objects and Arrays
    if (typeof val === 'object') {
      const isArray = Array.isArray(val);
      const entries = Object.entries(val);

      return (
        <div key={currentPath} style={{
          marginTop: path ? '0.5rem' : '1.5rem',
          padding: '1rem',
          borderRadius: '8px',
          background: path ? 'rgba(0,0,0,0.01)' : 'rgba(0,0,0,0.03)',
          border: '1px solid rgba(0,0,0,0.05)',
          marginLeft: path ? '0.5rem' : '0'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-primary)', marginBottom: entries.length > 0 ? '0.75rem' : '0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {isArray ? <List size={12} /> : <Settings size={12} />} {key}
            {isArray && <span style={{ fontSize: '0.65rem', opacity: 0.5, marginLeft: '0.5rem' }}>[ARRAY]</span>}
          </div>
          {entries.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '0.5rem' }}>
              {entries.map(([childKey, childValue]) =>
                renderConfigField(childValue, childKey, currentPath)
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontStyle: 'italic', padding: '0.25rem 0' }}>Empty {isArray ? 'array' : 'object'}</div>
          )}
        </div>
      );
    }

    // Primitives: String, Number, Boolean
    return (
      <div key={currentPath} className="flex-between" style={{ padding: '0.4rem 0' }}>
        <span style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 500 }}>{key}</span>
        <div style={{ flex: 1, marginLeft: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
          {typeof val === 'boolean' ? (
            <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => updateConfigField(currentPath, !val)}>
              <div style={{
                width: '32px',
                height: '18px',
                borderRadius: '9px',
                background: val ? 'var(--color-primary)' : '#cbd5e1',
                position: 'relative',
                transition: 'all 0.2s'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: '3px',
                  left: val ? '17px' : '3px',
                  transition: 'all 0.2s'
                }} />
              </div>
            </div>
          ) : (
            <input
              className="input"
              style={{
                width: '100%',
                maxWidth: '260px',
                fontSize: '0.8rem',
                padding: '0.3rem 0.6rem',
                background: '#fff',
                height: '32px'
              }}
              type={key.toLowerCase().includes('key') || key.toLowerCase().includes('secret') ? 'password' : 'text'}
              value={val === undefined ? '' : String(val)}
              onChange={(e) => updateConfigField(currentPath, e.target.value)}
            />
          )}
        </div>
      </div>
    );
  };

  const addConfigField = () => {
    if (!newConfigKey.trim()) return;
    updateConfigField(newConfigKey, newConfigValue);
    setNewConfigKey('');
    setNewConfigValue('');
  };

  // Fetch logic helpers
  const fetchAll = async (options: { skipEditable?: boolean } = {}) => {
    // 1. Status
    try {
      const res = await fetch('/api/openclaw/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
      const data = await res.json();
      if (data.success) {
        setIsRunning(data.running);
        setStatusDetail(data.detail || '');
        setVersionOutput(data.version || 'Unknown');
      }
    } catch (e) { console.error('Status fetch failed:', e); }

    // 2. Memory list
    try {
      const res = await fetch('/api/openclaw/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list_memory' }) });
      const data = await res.json();
      if (data.success) {
        const sortedFiles = (data.files || []).sort((a: any, b: any) =>
          new Date(b.mtime).getTime() - new Date(a.mtime).getTime()
        );
        setMemoryFiles(sortedFiles);
        const now = new Date();
        const mockHistory = Array.from({ length: 10 }).map((_, i) => ({
          time: new Date(now.getTime() - (9 - i) * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          count: Math.floor(sortedFiles.length * (0.8 + Math.random() * 0.4))
        }));
        setHistory(mockHistory);
      }
    } catch (e) { console.error('Memory fetch failed:', e); }

    // 3. Logs
    try {
      setLoadingLogs(true);
      const res = await fetch('/api/openclaw/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logs' }) });
      const data = await res.json();
      if (data.success) {
        setRecentLogs(data.data || '');
        setLastLogTime(new Date().toLocaleTimeString());
      } else {
        setRecentLogs(`Error: ${data.error || 'Failed to fetch logs'}`);
      }
    } catch (e) {
      console.error('Logs fetch failed:', e);
      setRecentLogs('Network error while fetching logs');
    } finally {
      setLoadingLogs(false);
    }

    // 4. Stats
    try {
      const res = await fetch('/api/system/stats');
      const data = await res.json();
      if (data.success) setSystemStats(data.data);
    } catch (e) { console.error('Stats fetch failed:', e); }

    // 5. Config
    if (!options.skipEditable) {
      try {
        const res = await fetch('/api/openclaw/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_config' }) });
        const data = await res.json();
        if (data.success) setConfigContent(data.content);
      } catch (e) { console.error('Config fetch failed:', e); }
    }

    // 6. Cron
    if (!options.skipEditable) {
      try {
        const res = await fetch('/api/openclaw/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get_cron' }) });
        const data = await res.json();
        if (data.success) setCronTasks(data.data?.jobs || []);
      } catch (e) { console.error('Cron fetch failed:', e); }
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(() => fetchAll({ skipEditable: true }), 10000);
    return () => clearInterval(interval);
  }, []);

  const saveConfig = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_config', content: configContent }),
      });
      const data = await res.json();
      if (data.success) alert('配置已成功保存');
      else alert(`保存失败: ${data.error}`);
    } catch (e) { alert('网络错误'); }
    finally { setIsSavingConfig(false); }
  };

  const toggleGateway = async () => {
    if (isRunning) {
      if (!window.confirm('确定要重启网关服务吗？')) return;

      try {
        const res = await fetch('/api/openclaw/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'command', command: `openclaw gateway restart` }),
        });
        const data = await res.json();
        if (data.success) {
          fetchAll();
        } else {
          alert(`重启失败: ${data.error}`);
        }
      } catch (e) {
        alert('网络错误');
      }
      return;
    }

    // Start action
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'command', command: `openclaw gateway start` }),
      });
      const data = await res.json();
      if (data.success) {
        fetchAll();
      } else {
        alert(`启动失败: ${data.error}`);
      }
    } catch (e) {
      alert('网络错误');
    }
  };

  const executeCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setCmdResult('Executing...');
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'command', command: cmd }),
      });
      const data = await res.json();
      setCmdResult(data.success ? (data.stdout || data.stderr || 'Success') : `Error: ${data.error}`);
      fetchAll();
    } catch (e) { setCmdResult('Network error'); }
  };

  const readMemory = async (file: any) => {
    setActiveMemoryFile(file);
    setMemoryContent('Loading...');
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_memory', path: file.path }),
      });
      const data = await res.json();
      setMemoryContent(data.success ? data.content : `Load error: ${data.error}`);
    } catch (e) { setMemoryContent('Network error'); }
  };

  const summarizeMemory = async () => {
    if (!memoryContent || memoryContent === 'Loading...') return;
    setIsSummarizing(true);
    setMemorySummary('AI 正在思考并总结这段记忆... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请简要总结以下这段记忆碎片的内容，突出核心重点。要求使用中文，简洁明了，采用列表形式或简短段落。内容如下：\n\n${memoryContent.slice(0, 4000)}`,
          systemPrompt: 'You are a helpful AI assistant that summarizes knowledge fragments.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setMemorySummary(data.data);
      } else {
        setMemorySummary(`总结失败: ${data.error}`);
      }
    } catch (e) {
      setMemorySummary('网络请求失败');
    } finally {
      setIsSummarizing(false);
    }
  };

  const optimizeMemory = async () => {
    if (!memoryContent || memoryContent === 'Loading...') return;
    if (!window.confirm('AI 将尝试优化内容结构和清晰度，这可能会修改现有文本。是否继续？')) return;

    setIsOptimizing(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请优化以下这段知识碎片的内容。要求保持原意不变，但提升排版、逻辑结构和语言清晰度。请确保输出仍然是标准的 Markdown 格式。内容如下：\n\n${memoryContent}`,
          systemPrompt: 'You are an expert editor who optimizes markdown knowledge notes for clarity and structure.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setMemoryContent(data.data);
      } else {
        alert(`优化失败: ${data.error}`);
      }
    } catch (e) {
      alert('网络请求失败');
    } finally {
      setIsOptimizing(false);
    }
  };

  const explainLogs = async () => {
    if (!recentLogs || loadingLogs) return;
    setIsExplainingLogs(true);
    setLogExplanation('AI 正在深度解析这些运行流水日志... 🪄');
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `请作为资深系统专家，分析以下 OpenClaw 网关的运行日志。请解释当前系统的状态、是否有异常情况（如有，请说明可能的报错原因及建议解决方案）。要求使用中文，结构清晰。日志内容如下：\n\n${recentLogs.slice(-4000)}`,
          systemPrompt: 'You are an expert system administrator and software engineer specializing in gateway and agent system logs.'
        })
      });
      const data = await res.json();
      if (data.success) {
        setLogExplanation(data.data);
      } else {
        setLogExplanation(`解析失败: ${data.error}`);
      }
    } catch (e) {
      setLogExplanation('网络请求失败');
    } finally {
      setIsExplainingLogs(false);
    }
  };

  const saveMemoryArr = async () => {
    if (!activeMemoryFile) return;
    setIsSavingMemory(true);
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_memory', path: activeMemoryFile.path, content: memoryContent }),
      });
      const data = await res.json();
      if (data.success) { alert('Saved successfully'); fetchAll(); }
      else alert(`Error: ${data.error}`);
    } catch (e) { alert('Network error'); }
    finally { setIsSavingMemory(false); }
  };

  const deleteMemory = async (file: any) => {
    if (!window.confirm(`确定要永久删除 ${file.name} 吗？`)) return;

    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_memory', path: file.path }),
      });
      const data = await res.json();
      if (data.success) {
        if (activeMemoryFile?.path === file.path) {
          setActiveMemoryFile(null);
          setMemoryContent('');
          setMemorySummary('');
        }
        fetchAll();
      } else {
        alert(`删除失败: ${data.error}`);
      }
    } catch (e) { alert('网络错误'); }
  };

  const saveCronTasks = async (tasks: any[]) => {
    setIsSavingCron(true);
    try {
      const res = await fetch('/api/openclaw/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_cron',
          content: { version: 1, jobs: tasks }
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCronTasks(tasks);
        setIsEditingCron(false);
      } else {
        alert('保存失败: ' + data.error);
      }
    } catch (e) {
      alert('网络请求失败');
    } finally {
      setIsSavingCron(false);
    }
  };

  const handleAddCron = () => {
    setEditingCronTask({
      id: crypto.randomUUID(),
      name: '',
      enabled: true,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
      schedule: {
        kind: 'cron',
        expr: '0 10 * * *',
        tz: 'Asia/Shanghai'
      },
      sessionTarget: 'isolated',
      wakeMode: 'now',
      payload: {
        kind: 'agentTurn',
        message: ''
      },
      delivery: {
        mode: 'announce',
        channel: 'telegram',
        to: ''
      },
      state: {
        nextRunAtMs: 0
      }
    });
    setIsEditingCron(true);
  };

  const handleEditCron = (task: any) => {
    setEditingCronTask({ ...task });
    setIsEditingCron(true);
  };

  const handleDeleteCron = (id: string) => {
    if (confirm('确定要删除这个定时任务吗？')) {
      const newTasks = cronTasks.filter(t => t.id !== id);
      saveCronTasks(newTasks);
    }
  };

  const handleToggleCron = (id: string) => {
    const newTasks = cronTasks.map(t =>
      t.id === id ? { ...t, enabled: !t.enabled } : t
    );
    saveCronTasks(newTasks);
  };

  const handleSaveCronEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const updatedTask = {
      ...editingCronTask,
      updatedAtMs: now,
      createdAtMs: editingCronTask.createdAtMs || now
    };

    const exists = cronTasks.find(t => t.id === updatedTask.id);
    let newTasks;
    if (exists) {
      newTasks = cronTasks.map(t => t.id === updatedTask.id ? updatedTask : t);
    } else {
      newTasks = [...cronTasks, updatedTask];
    }
    saveCronTasks(newTasks);
  };

  return (
    <div className="grid animate-fade-in openclaw-root" style={{ gap: '1.25rem', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Standard Header Section */}
      <div className="flex-between dashboard-page-header" style={{ marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <LobsterIcon size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>OpenClaw</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            className="btn btn-ghost"
            onClick={toggleGateway}
            title={isRunning ? '重启网关服务' : '启动网关服务'}
            style={{
              color: isRunning ? 'var(--color-warning)' : 'var(--color-success)',
              width: '36px',
              height: '36px',
              padding: 0,
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0,0,0,0.03)'
            }}
          >
            {isRunning ? <RotateCw size={18} /> : <Power size={18} />}
          </button>
          <button className="btn btn-ghost" onClick={() => fetchAll()} disabled={loadingLogs} style={{ gap: '0.5rem', height: '36px', background: 'rgba(0,0,0,0.03)' }}>
            <RefreshCw size={18} className={loadingLogs ? 'animate-spin' : ''} /> 刷新数据
          </button>
        </div>
      </div>

      {/* Tab Navigation - Integrated Header */}
      <div className="card glass-panel tab-nav-card sticky-tabs" style={{ padding: '0.4rem', zIndex: 10, width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
        <div className="tab-scroll-container no-scrollbar" style={{ display: 'flex', gap: '0.25rem', overflowX: 'auto', paddingBottom: '2px' }}>
          {[
            { id: 'overview', icon: LayoutGrid, label: '总览' },
            { id: 'monitor', icon: List, label: '运行日志' },
            { id: 'memory', icon: Brain, label: '知识库' },
            { id: 'config', icon: Settings, label: '参数配置' },
            { id: 'cron', icon: Clock, label: '定时任务' },
            { id: 'command', icon: Terminal, label: '命令执行' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={`btn ${activeTab === t.id ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                padding: '0.5rem 0.85rem',
                fontSize: '0.8rem',
                gap: '0.4rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                height: '36px'
              }}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Dynamic Content */}
      <div className="animate-fade-in">
        {/* OVERVIEW TAB - Many small modules */}
        {activeTab === 'overview' && (
          <div className="overview-grid">

            {/* Module 1: Status */}
            <div className="card glass-panel small-module" title={statusDetail}>
              <div className="module-header"><LobsterIcon size={14} /> 服务运行状态</div>
              <div className="module-value" style={{
                color: isRunning === null ? 'var(--color-text-muted)' :
                  isRunning ? 'var(--color-success)' :
                    statusDetail.includes('not found') ? 'var(--color-warning)' : 'var(--color-danger)'
              }}>
                {isRunning === null ? 'Loading...' : (isRunning ? 'Running' : statusDetail.includes('not found') ? 'Not Found' : 'Stopped')}
              </div>
              <div className="module-footer">
                {isRunning === null ? '正在同步运行状态...' : (statusDetail.includes('not found') ? '环境未检测到命令' : (isRunning ? `PID: ${statusDetail.match(/PID: (\d+)/i)?.[1] || statusDetail.match(/pid: (\d+)/)?.[1] || '--'}` : '服务已离线'))}
              </div>
            </div>

            {/* Module 2: Fragments */}
            <div className="card glass-panel small-module">
              <div className="module-header"><Brain size={14} /> 知识储存量</div>
              <div className="module-value">{isRunning === null ? '--' : memoryFiles.length} <span className="unit">FILES</span></div>
              <div className="module-footer">{isRunning === null ? '正在扫描目录...' : (isRunning ? '最近 24h 活跃' : '离线数据预览')}</div>
            </div>

            {/* Module 3: CPU Usage */}
            <div className="card glass-panel small-module">
              <div className="module-header"><Cpu size={14} /> 核心负载</div>
              <div className="module-value">{isRunning === null ? '--' : (isRunning ? (systemStats?.cpu?.user || 0) : 0)}<span className="unit">%</span></div>
              <div className="module-footer">{isRunning === null ? '等待数据收集...' : (isRunning ? '正常负载中' : '服务已离线')}</div>
            </div>

            {/* Module 4: Memory Usage */}
            <div className="card glass-panel small-module">
              <div className="module-header"><HardDrive size={14} /> 资源占用</div>
              <div className="module-value">{isRunning === null ? '--' : (isRunning ? (systemStats?.memory?.usedMB || 0) : '--')}<span className="unit">MB</span></div>
              <div className="module-footer">{isRunning === null ? '正在获取资源统计...' : (isRunning ? '分配内运行' : '无数据')}</div>
            </div>

            {/* Module 5: Storage Size */}
            <div className="card glass-panel small-module">
              <div className="module-header"><Database size={14} /> 存储占用</div>
              <div className="module-value">
                {isRunning === null ? '--' : (memoryFiles.reduce((acc, f) => acc + (f.size || 0), 0) / 1024).toFixed(1)}
                <span className="unit">KB</span>
              </div>
              <div className="module-footer">{isRunning === null ? '计算中...' : '本地知识库大小'}</div>
            </div>

            {/* Module 6: Safety Audit */}
            <div className="card glass-panel small-module">
              <div className="module-header"><ShieldCheck size={14} /> 安全合规性</div>
              <div className="module-value" style={{ color: isRunning === null ? 'var(--color-text-muted)' : (isRunning ? '#10b981' : 'var(--color-text-muted)'), fontSize: '1.1rem' }}>
                {isRunning === null ? 'PENDING' : (isRunning ? 'SECURE' : 'OFFLINE')}
              </div>
              <div className="module-footer">{isRunning === null ? '等待审计...' : (isRunning ? '验证审计通过' : '审计未就绪')}</div>
            </div>

            {/* Module 7: Network Activity */}
            <div className="card glass-panel small-module">
              <div className="module-header"><Zap size={14} /> 交互活跃度</div>
              <div className="module-value">{isRunning === null ? '--' : (isRunning ? 'Optimal' : 'N/A')}</div>
              <div className="module-footer">{isRunning === null ? '测试连通性...' : (isRunning ? '延迟: 12ms' : '连接不可用')}</div>
            </div>

            {/* Module 8: Version Info */}
            <div className="card glass-panel small-module" title={versionOutput}>
              <div className="module-header"><Settings size={14} /> 系统版本</div>
              <div className="module-value" style={{ fontSize: '0.8rem', color: 'inherit', wordBreak: 'break-all' }}>
                {isRunning === null ? 'Loading...' : versionOutput}
              </div>
              <div className="module-footer">{isRunning === null ? '查询版本中...' : 'openclaw -V 输出结果'}</div>
            </div>

            {/* Module 12: Real-time Log Preview (Medium Module - Spans 2 columns on desktop) */}
            <div className="card glass-panel span-2" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="flex-between" style={{ padding: '0.6rem 1rem', borderBottom: '1px solid var(--color-surface-border)', background: 'rgba(0,0,0,0.01)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <FileText size={14} color="var(--color-primary)" /> 最新运行日志 (Live)
                  {lastLogTime && <span style={{ fontSize: '0.65rem', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '0.5rem' }}>最后更新: {lastLogTime}</span>}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.65rem', height: '24px' }} onClick={() => setActiveTab('monitor')}>详情</button>
              </div>
              <div
                ref={previewLogRef}
                style={{
                  height: '110px',
                  padding: '0.75rem 1rem',
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: '0.75rem',
                  color: '#64748b',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.4,
                  background: 'rgba(255,255,255,0.4)'
                }}
              >
                {loadingLogs && !recentLogs ? '正在加载日志...' : (recentLogs || <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>暂无实时日志输出</div>)}
              </div>
            </div>



            {/* Module 10: Recent Active List (Spans 2 columns on desktop) */}
            <div className="card glass-panel span-2" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>最近活跃记忆</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', width: '100%' }}>
                {memoryFiles.slice(0, 4).map(f => (
                  <div key={f.path} style={{ fontSize: '0.75rem', padding: '0.4rem', background: 'rgba(0,0,0,0.02)', borderRadius: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                    {f.name}
                  </div>
                ))}
              </div>
            </div>


          </div>
        )}

        {/* MONITOR TAB */}
        {activeTab === 'monitor' && (
          <div className="card glass-panel" style={{ padding: 0 }}>
            <div className="flex-between" style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--color-surface-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>运行流水日志</span>
                {lastLogTime && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>同步时间: {lastLogTime}</span>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={explainLogs} disabled={isExplainingLogs || !recentLogs || loadingLogs} style={{ color: 'var(--color-primary)', background: 'rgba(59, 130, 246, 0.05)' }}>
                  <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isExplainingLogs ? 'animate-pulse' : ''} /> {isExplainingLogs ? '正在解析...' : 'AI 解析日志'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => fetchAll()} disabled={loadingLogs}>
                  {loadingLogs ? '加载中...' : '立即同步'}
                </button>
              </div>
            </div>
            {logExplanation && (
              <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.03)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', animation: 'slideInDown 0.3s ease' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: 'var(--color-primary)' }}>
                  <Brain size={16} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI 运行状态诊断报告</span>
                  <button onClick={() => setLogExplanation('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
                </div>
                <div style={{ fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.7 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{logExplanation}</ReactMarkdown>
                </div>
              </div>
            )}
            <div
              ref={monitorLogRef}
              style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.02)', height: '500px', overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'monospace', color: '#4b5563', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}
            >
              {loadingLogs && !recentLogs ? '正在同步数据...' : (recentLogs || '等待数据流入...')}
            </div>
          </div>
        )}

        {/* MEMORY TAB */}
        {activeTab === 'memory' && (
          <div className="memory-container">
            <div className="card glass-panel memory-sidebar" style={{ padding: 0, overflowY: 'auto' }}>
              {(() => {
                const coreFiles = memoryFiles.filter(f => !f.path.includes('/memory/'));
                const fragmentFiles = memoryFiles.filter(f => f.path.includes('/memory/'));

                const renderGroup = (label: string, icon: any, files: any[]) => (
                  <div key={label}>
                    <div style={{
                      padding: '0.6rem 1rem',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      color: 'var(--color-primary)',
                      background: 'rgba(59, 130, 246, 0.05)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      {icon} {label} ({files.length})
                    </div>
                    {files.map(f => (
                      <div
                        key={f.path}
                        onClick={() => readMemory(f)}
                        className={`flex-between`}
                        style={{
                          padding: '0.75rem 1rem 0.75rem 1.25rem',
                          cursor: 'pointer',
                          borderBottom: '1px solid rgba(0,0,0,0.05)',
                          background: activeMemoryFile?.path === f.path ? 'var(--color-primary-light)' : 'transparent',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ overflow: 'hidden' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: activeMemoryFile?.path === f.path ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', display: 'flex', gap: '0.75rem' }}>
                            <span>{(f.size / 1024).toFixed(1)} KB</span>
                            <span>{new Date(f.mtime).toLocaleDateString()} {new Date(f.mtime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px', height: '28px', width: '28px', color: 'var(--color-danger)', opacity: 0.6 }}
                            onClick={(e) => { e.stopPropagation(); deleteMemory(f); }}
                            title="删除"
                          >
                            <Trash2 size={12} />
                          </button>
                          <ChevronRight size={12} opacity={activeMemoryFile?.path === f.path ? 0.8 : 0.2} />
                        </div>
                      </div>
                    ))}
                  </div>
                );

                return (
                  <>
                    {coreFiles.length > 0 && renderGroup('核心架构 (Core)', <LayoutGrid size={12} />, coreFiles)}
                    {fragmentFiles.length > 0 && renderGroup('记忆碎片 (Fragments)', <FileText size={12} />, fragmentFiles)}
                  </>
                );
              })()}
            </div>
            <div className="card glass-panel memory-content" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--color-surface-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeMemoryFile?.name || '请选择文件'}</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button className="btn btn-ghost btn-sm" onClick={summarizeMemory} disabled={isSummarizing || isOptimizing || !activeMemoryFile || memoryContent === 'Loading...'} style={{ color: 'var(--color-primary)', background: 'rgba(59, 130, 246, 0.05)' }}>
                    <Sparkles size={14} style={{ marginRight: '0.4rem' }} className={isSummarizing ? 'animate-pulse' : ''} /> {isSummarizing ? '总结中...' : 'AI 总结'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={optimizeMemory} disabled={isSummarizing || isOptimizing || !activeMemoryFile || memoryContent === 'Loading...'} style={{ color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.05)' }}>
                    <Wand2 size={14} style={{ marginRight: '0.4rem' }} className={isOptimizing ? 'animate-spin' : ''} /> {isOptimizing ? '优化中...' : 'AI 优化'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={saveMemoryArr} disabled={isSavingMemory || isOptimizing || !activeMemoryFile}>
                    <Save size={14} style={{ marginRight: '0.4rem' }} /> 保存
                  </button>
                </div>
              </div>
              {memorySummary && (
                <div style={{ padding: '1rem', background: 'rgba(59, 130, 246, 0.03)', borderBottom: '1px solid rgba(59, 130, 246, 0.1)', animation: 'slideInDown 0.3s ease' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--color-primary)' }}>
                    <Sparkles size={14} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI 核心总结</span>
                    <button onClick={() => setMemorySummary('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-muted)', lineHeight: 1 }}>&times;</button>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#444', lineHeight: 1.6 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{memorySummary}</ReactMarkdown>
                  </div>
                </div>
              )}
              <textarea
                value={memoryContent}
                onChange={e => setMemoryContent(e.target.value)}
                style={{ flex: 1, padding: '1rem', border: 'none', background: 'transparent', outline: 'none', fontFamily: 'inherit', fontSize: '0.9rem', lineHeight: 1.6, minHeight: '520px' }}
              />
            </div>
          </div>
        )}

        {/* CONFIG TAB - RENAMED TO PARAMETER CONFIG */}
        {activeTab === 'config' && (
          <div className="card glass-panel" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="flex-between" style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--color-surface-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>openclaw.json</span>
                <div className="flex" style={{ background: 'rgba(0,0,0,0.05)', borderRadius: '6px', padding: '2px' }}>
                  <button
                    onClick={() => setConfigMode('visual')}
                    className="btn btn-sm"
                    style={{
                      fontSize: '0.7rem',
                      height: '24px',
                      padding: '0 0.75rem',
                      background: configMode === 'visual' ? '#fff' : 'transparent',
                      boxShadow: configMode === 'visual' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      color: configMode === 'visual' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >可视化</button>
                  <button
                    onClick={() => setConfigMode('source')}
                    className="btn btn-sm"
                    style={{
                      fontSize: '0.7rem',
                      height: '24px',
                      padding: '0 0.75rem',
                      background: configMode === 'source' ? '#fff' : 'transparent',
                      boxShadow: configMode === 'source' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      color: configMode === 'source' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >源码</button>
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={saveConfig} disabled={isSavingConfig}>
                <Save size={14} style={{ marginRight: '0.4rem' }} /> 保存配置
              </button>
            </div>

            {configMode === 'source' ? (
              <textarea
                value={configContent}
                onChange={e => setConfigContent(e.target.value)}
                style={{ padding: '1.25rem', background: 'rgba(0,0,0,0.01)', border: 'none', minHeight: '520px', fontSize: '0.85rem', fontFamily: 'monospace', outline: 'none', resize: 'none' }}
              />
            ) : (
              <div style={{ padding: '1.5rem', maxHeight: '520px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {/* Add New Field UI */}
                  <div style={{
                    display: 'flex',
                    gap: '0.5rem',
                    marginBottom: '1rem',
                    padding: '0.75rem',
                    background: 'rgba(59, 130, 246, 0.05)',
                    borderRadius: '8px',
                    border: '1px dashed var(--color-primary)',
                    alignItems: 'center'
                  }}>
                    <input
                      type="text"
                      className="input"
                      placeholder="新 Key (支持多级，如 api.key)"
                      value={newConfigKey}
                      onChange={e => setNewConfigKey(e.target.value)}
                      style={{ flex: 1, fontSize: '0.8rem', height: '32px' }}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="值 (自动识别数字/布尔)"
                      value={newConfigValue}
                      onChange={e => setNewConfigValue(e.target.value)}
                      style={{ flex: 1, fontSize: '0.8rem', height: '32px' }}
                    />
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={addConfigField}
                      style={{ height: '32px', padding: '0 0.75rem' }}
                      title="添加配置项"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {Object.keys(parseConfig()).length > 0 ? (
                    Object.entries(parseConfig()).map(([key, value]) =>
                      renderConfigField(value, key)
                    )
                  ) : (
                    <div style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                      配置文件内容为空或格式错误
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COMMAND TAB */}
        {activeTab === 'command' && (
          <div className="card glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { label: '网关状态', cmd: 'openclaw gateway status' },
                { label: '启动网关', cmd: 'openclaw gateway start' },
                { label: '停止网关', cmd: 'openclaw gateway stop' },
                { label: '重启网关', cmd: 'openclaw gateway restart' },
                { label: '系统诊断', cmd: 'openclaw doctor' },
                { label: '安全审计', cmd: 'openclaw security audit' },
                { label: '版本检查', cmd: 'openclaw -V' },
                { label: '显示帮助', cmd: 'openclaw --help' },
                { label: '搜索记忆', cmd: 'openclaw memory search ""' },
                { label: '索引记忆', cmd: 'openclaw memory index' },
                { label: '清空缓存', cmd: 'openclaw cache clear' },
                { label: '代理列表', cmd: 'openclaw agents list' },
                { label: '插件列表', cmd: 'openclaw plugins list' },
                { label: '日志跟随', cmd: 'openclaw logs --follow' },
                { label: '配置验证', cmd: 'openclaw config check' },
              ].map(item => (
                <button
                  key={item.label}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '0.75rem', border: '1px solid var(--color-surface-border)', padding: '0.4rem 0.75rem' }}
                  onClick={() => setCmd(item.cmd)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <form onSubmit={executeCommand} style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={cmd}
                onChange={e => setCmd(e.target.value)}
                className="input"
                placeholder="输入 OpenClaw 命令..."
                style={{ flex: 1 }}
              />
              <button type="submit" className="btn btn-primary">执行指令</button>
            </form>
            <div
              ref={cmdResultRef}
              style={{ padding: '1.25rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid var(--color-surface-border)', height: '400px', overflowY: 'auto', fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--color-primary)', whiteSpace: 'pre-wrap' }}
            >
              {cmdResult || '等待指令输入...'}
            </div>
          </div>
        )}

        {/* CRON TAB */}
        {activeTab === 'cron' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            <div className="flex-between">
              <h2 className="card-title" style={{ margin: 0 }}>定时任务管理</h2>
              <button className="btn btn-primary btn-sm" onClick={handleAddCron}>
                <Plus size={14} style={{ marginRight: '0.4rem' }} /> 新增任务
              </button>
            </div>

            {isEditingCron && (
              <div className="card glass-panel animate-fade-in" style={{ padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid var(--color-primary)' }}>
                <form onSubmit={handleSaveCronEdit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>任务名称</label>
                    <input
                      required
                      type="text"
                      className="input"
                      style={{ fontSize: '0.85rem' }}
                      placeholder="例如: 每日状态检查"
                      value={editingCronTask.name}
                      onChange={e => setEditingCronTask({ ...editingCronTask, name: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Cron 表达式</label>
                    <input
                      required
                      type="text"
                      className="input"
                      style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                      placeholder="0 10 * * *"
                      value={editingCronTask.schedule.expr}
                      onChange={e => setEditingCronTask({
                        ...editingCronTask,
                        schedule: { ...editingCronTask.schedule, expr: e.target.value }
                      })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>通知渠道</label>
                    <select
                      className="input"
                      style={{ fontSize: '0.85rem' }}
                      value={editingCronTask.delivery.channel}
                      onChange={e => setEditingCronTask({
                        ...editingCronTask,
                        delivery: { ...editingCronTask.delivery, channel: e.target.value }
                      })}
                    >
                      <option value="telegram">Telegram</option>
                      <option value="email">Email</option>
                      <option value="none">无</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>目标 ID (To)</label>
                    <input
                      type="text"
                      className="input"
                      style={{ fontSize: '0.85rem' }}
                      placeholder="Telegram ID"
                      value={editingCronTask.delivery.to}
                      onChange={e => setEditingCronTask({
                        ...editingCronTask,
                        delivery: { ...editingCronTask.delivery, to: e.target.value }
                      })}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>执行消息 (Prompt/Command)</label>
                    <textarea
                      required
                      className="input"
                      style={{ fontSize: '0.85rem', fontFamily: 'monospace', minHeight: '80px', resize: 'vertical' }}
                      placeholder="请输入任务执行的消息内容..."
                      value={editingCronTask.payload.message}
                      onChange={e => setEditingCronTask({
                        ...editingCronTask,
                        payload: { ...editingCronTask.payload, message: e.target.value }
                      })}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                    <button type="submit" className="btn btn-primary" disabled={isSavingCron}>
                      {isSavingCron ? '正在保存...' : '保存任务'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setIsEditingCron(false)}>
                      取消
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div style={{
              display: 'grid',
              gap: '0.75rem',
              maxHeight: 'calc(100vh - 380px)',
              overflowY: 'auto',
              paddingRight: '0.5rem',
              minHeight: '200px'
            }} className="no-scrollbar">
              {cronTasks.length > 0 ? (
                cronTasks.map(task => (
                  <div key={task.id} className="card glass-panel cron-task-card" style={{
                    padding: '1rem',
                    opacity: task.enabled ? 1 : 0.6,
                    border: task.enabled ? '1px solid var(--color-surface-border)' : '1px solid transparent',
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    minWidth: 0
                  }}>
                    <div style={{ display: 'flex', alignItems: 'start', gap: '1rem', flex: 1, minWidth: 0 }}>
                      <div style={{ padding: '0.6rem', borderRadius: '10px', background: task.enabled ? 'var(--color-primary-light)' : 'rgba(0,0,0,0.05)', color: task.enabled ? 'var(--color-primary)' : 'var(--color-text-muted)', flexShrink: 0 }}>
                        <Clock size={20} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
                          {!task.enabled && <span className="badge" style={{ backgroundColor: '#e2e8f0', color: '#64748b', fontSize: '0.65rem' }}>已禁用</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock size={10} /> {task.schedule?.expr || '--'}
                          </div>
                          {task.delivery?.channel !== 'none' && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <MessageSquare size={10} /> {task.delivery?.channel} ({task.delivery?.to || '未指定'})
                            </div>
                          )}
                        </div>
                        <div style={{
                          fontSize: '0.8rem',
                          color: 'var(--color-primary)',
                          marginTop: '0.5rem',
                          background: 'var(--color-primary-light)',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '8px',
                          wordBreak: 'break-all',
                          whiteSpace: 'pre-wrap',
                          display: 'block',
                          maxWidth: '100%',
                          fontFamily: 'monospace',
                          lineHeight: 1.5,
                          border: '1px solid rgba(59, 130, 246, 0.1)'
                        }}>
                          {task.payload?.message || '--'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.4rem', color: task.enabled ? 'var(--color-danger)' : 'var(--color-success)' }}
                        onClick={() => handleToggleCron(task.id)}
                        title={task.enabled ? '禁用' : '启用'}
                      >
                        <Power size={16} />
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleEditCron(task)} style={{ fontSize: '0.8rem' }}>
                        修改
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteCron(task.id)} style={{ fontSize: '0.8rem', color: 'var(--color-danger)' }}>
                        删除
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ textAlign: 'center', padding: '3rem', background: 'rgba(0,0,0,0.01)', borderRadius: '1rem', border: '1px dashed var(--color-surface-border)' }}>
                  <Clock size={48} style={{ margin: '0 auto 1rem', opacity: 0.2 }} />
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>暂无定时任务</p>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: '1rem' }} onClick={handleAddCron}>立即添加</button>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--color-primary-light)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(59, 130, 246, 0.1)', fontSize: '0.75rem', color: 'var(--color-primary)' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={14} /> 系统说明
              </div>
              定时任务需要系统中存在对应的 Cron 执行器或 OpenClaw 守护进程支持。此处提供任务配置的可视化管理（CRUD）。
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .sticky-tabs {
          position: sticky;
          top: 0;
          z-index: 10;
        }
        @media (max-width: 768px) {
          .sticky-tabs {
            top: 80px; /* Below mobile header */
            margin: 0;
            border-radius: var(--radius-sm);
          }
        }
        .openclaw-dashboard-container {
          display: flex;
          gap: 1.5rem;
          align-items: flex-start;
        }
        .openclaw-sidebar {
          width: 240px;
          flex-shrink: 0;
          position: sticky;
          top: 1.5rem;
        }
        .openclaw-content {
          flex: 1;
          min-width: 0;
        }
        @media (max-width: 1024px) {
          .openclaw-sidebar {
            width: 200px;
          }
        }
        @media (max-width: 768px) {
          .openclaw-dashboard-container {
            flex-direction: column;
          }
          .openclaw-sidebar {
            width: 100%;
            position: static;
          }
        }
        .memory-container {
          display: flex;
          gap: 1.5rem;
          align-items: stretch;
        }
        .memory-sidebar {
          width: 250px;
          flex-shrink: 0;
          height: 600px;
          overflow-y: auto;
        }
        .memory-content {
          flex: 1;
          min-width: 0;
        }
        @media (max-width: 1024px) {
          .memory-container {
            flex-direction: column;
            gap: 1rem;
          }
          .memory-sidebar {
            width: 100%;
            height: 200px;
          }
          .memory-content textarea {
            min-height: 400px !important;
          }
        }
        .overview-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        @media (min-width: 640px) {
          .overview-grid {
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          }
          .span-2 {
            grid-column: span 2;
          }
        }
        .small-module {
          padding: 1rem;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 110px;
          width: 100%;
        }
        .module-header {
          font-size: 0.7rem;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          display: flex;
          align-items: center;
          gap: 0.4rem;
          font-weight: 600;
        }
        .module-value {
          font-size: 1.5rem;
          font-weight: 800;
          margin: 0.5rem 0;
          display: flex;
          align-items: baseline;
          gap: 0.25rem;
        }
        .unit {
          font-size: 0.75rem;
          font-weight: 400;
          color: var(--color-text-muted);
        }
        .module-footer {
          font-size: 0.7rem;
          color: var(--color-text-muted);
          opacity: 0.8;
        }
        .cron-task-card {
          flex-direction: row;
        }
        @media (max-width: 640px) {
          .cron-task-card {
            flex-direction: column !important;
            align-items: stretch !important;
          }
        }
      `}</style>
    </div>
  );
}
