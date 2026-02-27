"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

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
        setError(data.error || '登录失败，请检查用户名或密码。');
      }
    } catch (err) {
      setError('网络或服务器错误。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-center" style={{ minHeight: '100vh', padding: '1rem' }} suppressHydrationWarning>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem' }} suppressHydrationWarning>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} suppressHydrationWarning>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px',
            background: 'linear-gradient(135deg, var(--color-primary), #60a5fa)',
            margin: '0 auto 1.5rem', display: 'flex', alignItems: 'center',
            justifyContent: 'center', boxShadow: '0 8px 16px rgba(59, 130, 246, 0.3)'
          }} suppressHydrationWarning>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" suppressHydrationWarning>
              <circle cx="12" cy="12" r="3" fill="white" />
              <circle cx="12" cy="12" r="7" stroke="white" strokeOpacity="0.4" />
              <circle cx="12" cy="12" r="11" stroke="white" strokeOpacity="0.1" />
              <path d="M15 9l2-2M7 15l2-2" stroke="white" strokeOpacity="0.5" strokeWidth="1.5" />
            </svg>
          </div>
          <h1 className="card-title" style={{ fontSize: '2.5rem', marginBottom: '0.25rem', fontWeight: 900, letterSpacing: '0.1em' }} suppressHydrationWarning>FLUX</h1>
          <div style={{ fontSize: '1rem', color: 'var(--color-primary)', fontWeight: 600, letterSpacing: '0.6em', textIndent: '0.6em', marginBottom: '1.5rem', opacity: 0.8 }} suppressHydrationWarning>浮光</div>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }} suppressHydrationWarning>极简且强大的 macOS 管理面板</p>
        </div>

        {error && (
          <div className="badge badge-danger" style={{ display: 'block', textAlign: 'center', marginBottom: '1.5rem', padding: '0.75rem', borderRadius: '8px' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="grid" style={{ gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--color-text)' }}>用户名</label>
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500, color: 'var(--color-text)' }}>密码</label>
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
            {loading ? '登录中...' : '登录'}
          </button>
        </form>
      </div>
    </div>
  );
}
