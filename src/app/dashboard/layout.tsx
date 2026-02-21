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

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="app-layout" style={{ opacity: 0 }}></div>;
  }

  return (
    <div className="app-layout">
      {/* Sidebar Navigation */}
      <aside className="glass-panel app-sidebar">
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

        <div className={`app-sidebar-content ${isMenuOpen ? 'open' : ''}`}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <NavLink href="/dashboard" icon="cpu" onClick={() => setIsMenuOpen(false)}>系统监控</NavLink>
            <NavLink href="/dashboard/logs" icon="list" onClick={() => setIsMenuOpen(false)}>日志浏览</NavLink>
            <NavLink href="/dashboard/docker" icon="box" onClick={() => setIsMenuOpen(false)}>Docker 管理</NavLink>
            <NavLink href="/dashboard/launchagent" icon="settings" onClick={() => setIsMenuOpen(false)}>LaunchAgent 配置</NavLink>
            <NavLink href="/dashboard/nginx" icon="server" onClick={() => setIsMenuOpen(false)}>Nginx 监控</NavLink>
            <NavLink href="/dashboard/openclaw" icon="terminal" onClick={() => setIsMenuOpen(false)}>OpenClaw 控制</NavLink>
          </nav>

          <div style={{ marginTop: 'auto', paddingTop: '1rem' }}>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: '0.75rem' }}
              onClick={() => {
                document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
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
      case 'settings': return <><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></>;
      case 'server': return <><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></>;
      case 'list': return <><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></>;
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
