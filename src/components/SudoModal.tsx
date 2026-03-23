"use client";

import { useLanguage } from '@/lib/LanguageContext';
import { Shield, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

interface SudoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (password: string) => void;
  description?: string;
  isError?: boolean;
}

export default function SudoModal({ isOpen, onClose, onSubmit, description, isError }: SudoModalProps) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password) {
      onSubmit(password);
      setPassword('');
    }
  };

  return (
    <div className="sudo-modal-overlay" onClick={onClose} style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      animation: 'fadeIn 0.2s ease'
    }}>
      <div className="card glass-panel" onClick={e => e.stopPropagation()} style={{ 
        maxWidth: '420px', 
        width: '90%', 
        padding: '1.75rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        animation: 'modalSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ 
              background: isError ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-primary-light)', 
              padding: '0.6rem', 
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Shield size={24} color={isError ? '#ef4444' : 'var(--color-primary)'} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                {isError ? t.common.error : t.common.sudoTitle}
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                Secure Authentication
              </div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: 'var(--color-text-muted)',
              padding: '4px',
              borderRadius: '50%',
              display: 'flex',
              transition: 'all 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <X size={20} />
          </button>
        </div>
        
        <div style={{ 
          fontSize: '0.875rem', 
          color: 'var(--color-text)', 
          marginBottom: '1.5rem', 
          lineHeight: 1.6,
          background: isError ? 'rgba(239, 68, 68, 0.03)' : 'rgba(59, 130, 246, 0.03)',
          padding: '0.85rem',
          borderRadius: 'var(--radius-md)',
          borderLeft: `4px solid ${isError ? '#ef4444' : 'var(--color-primary)'}`
        }}>
          {isError ? t.common.passwordIncorrect : (description || t.common.sudoDesc)}
        </div>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {isError ? t.common.passwordIncorrect : t.common.sudoPlaceholder}
            </label>
            <input
              ref={inputRef}
              type="password"
              className="input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ 
                width: '100%',
                fontSize: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '10px',
                border: isError ? '2px solid #ef4444' : '2px solid var(--color-surface-border)',
                transition: 'all 0.2s',
                outline: 'none'
              }}
              onFocus={e => !isError && (e.currentTarget.style.borderColor = 'var(--color-primary)')}
              onBlur={e => !isError && (e.currentTarget.style.borderColor = 'var(--color-surface-border)')}
            />
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <button 
              type="button" 
              className="btn btn-ghost" 
              onClick={onClose}
              style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem' }}
            >
              {t.common.cancel}
            </button>
            <button 
              type="submit" 
              className="btn btn-primary" 
              disabled={!password}
              style={{ 
                padding: '0.6rem 2rem', 
                fontSize: '0.9rem', 
                fontWeight: 600,
                boxShadow: password ? '0 10px 15px -3px rgba(59, 130, 246, 0.3)' : 'none'
              }}
            >
              {t.common.confirm}
            </button>
          </div>
        </form>
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
