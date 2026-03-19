"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { Globe } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push('/dashboard');
        router.refresh(); // Refresh to apply middleware session state securely
      } else {
        setError(data.error || t.login.error);
      }
    } catch (err) {
      setError(t.login.networkError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '100vh', padding: '1rem', position: 'relative' }} suppressHydrationWarning>
      <div style={{ position: 'absolute', top: '2rem', right: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', zIndex: 10 }}>
        {mounted && (
          <>
            <Globe size={18} style={{ color: 'var(--color-text-muted)' }} />
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'zh' | 'en' | 'auto')}
              className="input"
              style={{ padding: '0.3rem 1.5rem 0.3rem 0.6rem', fontSize: '0.85rem', height: 'auto', background: 'rgba(255, 255, 255, 0.5)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer' }}
            >
              <option value="auto">{t.common.systemDefault}</option>
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </>
        )}
      </div>

      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }} suppressHydrationWarning>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} suppressHydrationWarning>
          <div style={{
            width: '64px', height: '64px',
            margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center',
            justifyContent: 'center'
          }} suppressHydrationWarning>
            <img src="/logo.png" alt="Flux" style={{ width: '64px', height: '64px', borderRadius: '16px' }} />
          </div>
          <h1 className="card-title" style={{ fontSize: '2.5rem', marginBottom: '0.25rem', fontWeight: 900, letterSpacing: '0.1em' }} suppressHydrationWarning>{t.login.title}</h1>
          {t.login.logoText && <div style={{ fontSize: '1rem', color: 'var(--color-primary)', fontWeight: 600, letterSpacing: '0.6em', textIndent: '0.6em', marginBottom: '1.5rem', opacity: 0.8 }} suppressHydrationWarning>{t.login.logoText}</div>}
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: t.login.logoText ? '0' : '1.5rem' }} suppressHydrationWarning>{t.login.subtitle}</p>
        </div>

        {error && (
          <div className="badge badge-danger" style={{ display: 'block', textAlign: 'center', marginBottom: '1.5rem', padding: '0.75rem', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="grid" style={{ gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--color-text)' }}>{t.login.username}</label>
            <input
              type="text"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              suppressHydrationWarning
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--color-text)' }}>{t.login.password}</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              suppressHydrationWarning
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '0.85rem', marginTop: '1rem', fontSize: '1.05rem' }}
            disabled={loading}
          >
            {loading ? t.login.submitting : t.login.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
