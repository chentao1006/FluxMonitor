"use client";

import { useLanguage } from '@/lib/LanguageContext';
import { X } from 'lucide-react';
import Image from 'next/image';

interface IOSAppGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function IOSAppGuide({ isOpen, onClose }: IOSAppGuideProps) {
  const { t, language } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="ios-guide-overlay animate-fade-in" onClick={onClose}>
      <div className="ios-guide-modal glass-panel animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button className="dismiss-btn" onClick={onClose}>
          <X size={20} />
        </button>
        
        <div className="modal-content">
          <div className="qr-container">
            <Image 
              src="/qrcode.png" 
              alt={t.ios.scanToRemote} 
              width={180} 
              height={180} 
              className="qr-image" 
            />
            <div className="qr-glow"></div>
          </div>
          
          <div className="text-content">
            <h3>{t.ios.title}</h3>
            <p>{t.ios.desc}</p>
          </div>
          
          <div className="action-buttons">
            <a 
              href="https://apps.apple.com/app/flux-remote/id6761290185" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ display: 'block', margin: '0 auto' }}
            >
                <Image 
                src={t.ios.appStoreBadge} 
                alt="App Store" 
                width={132}
                height={44}
                style={{ display: 'block', margin: '0 auto' }} 
              />
            </a>
            <button className="btn btn-ghost btn-block" onClick={onClose}>
              {t.ios.dismiss}
            </button>
          </div>
        </div>
      </div>

      <style jsx>{`
        .ios-guide-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
        }
        
        .ios-guide-modal {
          width: 100%;
          max-width: 360px;
          position: relative;
          padding: 2.5rem 1.5rem 1.5rem;
          text-align: center;
        }
        
        .dismiss-btn {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: none;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 50%;
          transition: all 0.2s;
        }
        
        .dismiss-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: var(--color-text);
        }
        
        .qr-container {
          position: relative;
          width: 180px;
          height: 180px;
          margin: 0 auto 1.5rem;
        }
        
        .qr-image {
          width: 100%;
          height: 100%;
          border-radius: 1rem;
          position: relative;
          z-index: 2;
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
        }
        
        .qr-glow {
          position: absolute;
          inset: -10px;
          background: radial-gradient(circle, var(--color-primary-light) 0%, transparent 70%);
          opacity: 0.5;
          z-index: 1;
          filter: blur(8px);
        }
        
        .text-content h3 {
          margin: 0 0 0.5rem;
          font-size: 1.25rem;
          font-weight: 700;
        }
        
        .text-content p {
          color: var(--color-text-muted);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-bottom: 2rem;
        }
        
        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        
        .btn-block {
          width: 100%;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem !important;
        }

        .animate-slide-up {
          animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
