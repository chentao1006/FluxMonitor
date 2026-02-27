"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [features, setFeatures] = useState<any>({
    monitor: true,
    processes: true,
    logs: true,
    configs: true,
    launchagent: true,
    docker: true,
    nginx: true,
    openclaw: true
  });

  useEffect(() => {
    setMounted(true);
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.features) {
          setFeatures(data.data.features);
        }
      })
      .catch(err => console.error('Load features failed', err));
  }, []);

  if (!mounted) {
    return <div className="app-layout" style={{ opacity: 0 }}></div>;
  }

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="glass-panel app-sidebar" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="flex-between">
          <div className="flex-center" style={{ gap: '0.75rem' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--color-primary), #60a5fa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" suppressHydrationWarning>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" suppressHydrationWarning></polyline>
              </svg>
            </div>
            <h2 style={{ fontSize: '1.25rem', margin: 0 }} suppressHydrationWarning>监控面板</h2>
          </div>
          <button
            className="mobile-menu-btn"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" suppressHydrationWarning>
              {isMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </>
              )}
            </svg>
          </button>
        </div>

        <div className={`app-sidebar-content ${isMenuOpen ? 'open' : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto', paddingRight: '4px' }} className="no-scrollbar">
            {features.monitor !== false && <NavLink href="/dashboard" icon="activity" onClick={() => setIsMenuOpen(false)}>系统监控</NavLink>}
            {features.processes !== false && <NavLink href="/dashboard/processes" icon="layers" onClick={() => setIsMenuOpen(false)}>进程管理</NavLink>}
            {features.logs !== false && <NavLink href="/dashboard/logs" icon="file-text" onClick={() => setIsMenuOpen(false)}>日志浏览</NavLink>}
            {features.configs !== false && <NavLink href="/dashboard/configs" icon="settings" onClick={() => setIsMenuOpen(false)}>配置管理</NavLink>}
            {features.launchagent !== false && <NavLink href="/dashboard/launchagent" icon="rocket" onClick={() => setIsMenuOpen(false)}>LaunchAgent 配置</NavLink>}
            {features.docker !== false && <NavLink href="/dashboard/docker" icon="box" onClick={() => setIsMenuOpen(false)}>Docker 管理</NavLink>}
            {features.nginx !== false && <NavLink href="/dashboard/nginx" icon="server" onClick={() => setIsMenuOpen(false)}>Nginx 监控</NavLink>}
            {features.openclaw !== false && <NavLink href="/dashboard/openclaw" icon="lobster" onClick={() => setIsMenuOpen(false)}>OpenClaw 控制</NavLink>}
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--color-surface-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <NavLink href="/dashboard/settings" icon="sliders" onClick={() => setIsMenuOpen(false)}>系统设置</NavLink>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem' }}
              onClick={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
              退出登录
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="animate-fade-in app-main">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children, icon, onClick }: { href: string; children: React.ReactNode; icon: string; onClick?: () => void }) {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));

  const getIcon = (name: string) => {
    switch (name) {
      case 'cpu': return <path d="M4 4h16v16H4zm0 4h16m-16 4h16m-16 4h16M8 4v16m4-16v16m4-16v16" />;
      case 'box': return <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>;
      case 'terminal': return <><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></>;
      case 'lobster': return (
        <>
          <path d="M12 3c-1.5 0-3 1-3 3 0 2 1.5 2.5 3 3.5 1.5-1 3-1.5 3-3.5 0-2-1.5-3-3-3z" />
          <path d="M18 10c1 0 3 .5 3 2.5s-2 2.5-3 2.5c-.5 0-1 0-1.5-.5" />
          <path d="M6 10c-1 0-3 .5-3 2.5s2 2.5 3 2.5c.5 0 1 0 1.5-.5" />
          <path d="M12 9v11a2 2 0 0 1-4 0M12 12v8a2 2 0 0 0 4 0" />
          <path d="M12 7c-1-2-2-3-4-3M12 7c1-2 2-3 4-3" />
          <circle cx="9" cy="5" r="0.5" fill="currentColor" />
          <circle cx="15" cy="5" r="0.5" fill="currentColor" />
        </>
      );

      case 'sliders': return <><line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="2" y1="14" x2="6" y2="14"></line><line x1="10" y1="8" x2="14" y2="8"></line><line x1="18" y1="16" x2="22" y2="16"></line></>;
      case 'settings': return <><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></>;
      case 'rocket': return (
        <>
          <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
          <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
          <path d="M9 12H4s.55-3.03 2-5a2 2 0 0 1 3-1" />
          <path d="M12 15v5s3.03-.55 5-2a2 2 0 0 0 1-3" />
        </>
      );
      case 'server': return <><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></>;
      case 'list': return <><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></>;
      case 'file-text': return <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></>;
      case 'activity': return <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>;
      case 'layers': return <><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></>;
      default: return null;
    }
  }

  // If not mounted, render a placeholder or the same structure but without children/logic that triggers extensions
  if (!mounted) {
    return (
      <div className="btn btn-ghost" style={{ width: '100%', padding: '0.85rem 1rem', opacity: 0 }}>
        <div style={{ width: '20px', height: '20px' }} />
        <span>{children}</span>
      </div>
    );
  }

  return (
    <Link href={href} style={{ textDecoration: 'none' }} onClick={onClick}>
      <div className={`btn ${isActive ? '' : 'btn-ghost'}`} style={{
        width: '100%', justifyContent: 'flex-start', padding: '0.85rem 1rem',
        borderRadius: 'var(--radius-sm)', gap: '0.75rem', fontWeight: 500,
        background: isActive ? 'var(--color-primary-light)' : '',
        color: isActive ? 'var(--color-primary)' : ''
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <g>{getIcon(icon)}</g>
        </svg>
        <span>{children}</span>
      </div>
    </Link>
  )
}
