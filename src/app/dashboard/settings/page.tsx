"use client";

import { useEffect, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { Sliders, Save, User, Cpu, Power, Info, AlertTriangle } from 'lucide-react';

export default function SettingsPage() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
      }
    } catch (e) {
      console.error('获取设置失败', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaveStatus(t.settings.saving);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus(t.settings.saveSuccess);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setSaveStatus(`${t.common.saveFailed}: ${data.error}`);
      }
    } catch (e) {
      setSaveStatus(t.common.networkError);
    }
  };

  const updateAI = (field: string, value: string) => {
    setConfig({
      ...config,
      ai: { ...config.ai, [field]: value }
    });
  };

  const updateFeature = (feature: string, enabled: boolean) => {
    setConfig({
      ...config,
      features: { ...config.features, [feature]: enabled }
    });
  };

  const updateUser = (index: number, field: string, value: string) => {
    const newUsers = [...config.users];
    newUsers[index] = { ...newUsers[index], [field]: value };
    setConfig({ ...config, users: newUsers });
  };

  if (loading || !config) return <div className="flex-center" style={{ height: '70vh' }}>{t.common.loading}</div>;

  return (
    <div className="grid no-scrollbar animate-fade-in" style={{ gap: '1.25rem', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <div className="flex-between flex-column-mobile" style={{ gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="icon-container" style={{ background: 'var(--color-primary-light)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
            <Sliders size={24} color="var(--color-primary)" />
          </div>
          <h1 className="card-title" style={{ fontSize: '1.5rem', margin: 0 }}>{t.settings.title}</h1>
        </div>
        <button className="btn btn-primary mobile-full-width" onClick={handleSave} style={{ gap: '0.5rem', padding: '0.6rem 1.5rem' }}>
          <Save size={18} />
          {t.settings.saveBtn}
        </button>
      </div>

      {saveStatus && (
        <div className={`badge ${saveStatus.includes('成功') || saveStatus.includes('Success') ? 'badge-success' : 'badge-danger'}`} style={{ padding: '0.75rem 1rem', width: 'fit-content' }}>
          {saveStatus}
        </div>
      )}

      <div className="responsive-grid responsive-grid-2" style={{ gap: '1.25rem', width: '100%' }}>

        {/* Feature Toggles */}
        <section className="card glass-panel span-2" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <Power size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t.settings.features}</h2>
          </div>
          <div className="responsive-grid responsive-grid-auto" style={{ gap: '1rem' }}>
            {Object.entries(config.features || {}).map(([key, enabled]: [string, any]) => (
              <label
                key={key}
                className="flex-between glass-panel"
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.2s',
                  border: enabled ? '1px solid var(--color-primary-light)' : '1px solid transparent'
                }}
              >
                <span style={{
                  fontWeight: 500,
                  color: enabled ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  opacity: enabled ? 1 : 0.7
                }}>
                  {(t.sidebar as any)[key] || key}
                </span>
                <label className="switch" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={e => updateFeature(key, e.target.checked)}
                  />
                  <span className="slider"></span>
                </label>
              </label>
            ))}
          </div>
          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            <Info size={14} />
            <span>{t.settings.featuresDesc}</span>
          </div>
        </section>

        {/* Account Management */}
        <section className="card glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <User size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t.settings.account}</h2>
          </div>
          {config.users.map((user: any, i: number) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{t.settings.username}</label>
                <input
                  type="text"
                  className="input"
                  value={user.username}
                  onChange={e => updateUser(i, 'username', e.target.value)}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{t.settings.password}</label>
                <input
                  type="password"
                  className="input"
                  placeholder={t.settings.passwordPlaceholder}
                  onChange={e => e.target.value && updateUser(i, 'password', e.target.value)}
                />
              </div>
            </div>
          ))}
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.75rem', color: '#b45309', margin: 0 }}>
              {t.settings.passwordNote}
            </p>
          </div>
        </section>

        {/* AI Configuration */}
        <section className="card glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <Cpu size={20} color="var(--color-primary)" />
            <h2 style={{ fontSize: '1.1rem', margin: 0 }}>{t.settings.aiConfig}</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{t.settings.endpoint}</label>
              <input
                type="text"
                className="input"
                placeholder="https://api.openai.com/v1"
                value={config.ai?.url || ''}
                onChange={e => updateAI('url', e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{t.settings.apiKey}</label>
              <input
                type="password"
                className="input"
                placeholder="sk-..."
                value={config.ai?.key || ''}
                onChange={e => updateAI('key', e.target.value)}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>{t.settings.model}</label>
              <input
                type="text"
                className="input"
                placeholder="gpt-4o-mini"
                value={config.ai?.model || ''}
                onChange={e => updateAI('model', e.target.value)}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
