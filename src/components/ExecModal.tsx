"use client";

import { useState, useRef, useEffect } from "react";
import { X, Play, Square } from "lucide-react";
import { useLanguage } from "@/lib/LanguageContext";

interface ExecModalProps {
  isOpen: boolean;
  onClose: () => void;
  command: string;
}

export default function ExecModal({ isOpen, onClose, command }: ExecModalProps) {
  const { t } = useLanguage();
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result]);

  useEffect(() => {
    if (isOpen && command) {
      setResult("");
      setError("");
      handleExec();
    }
    // eslint-disable-next-line
  }, [isOpen, command]);

  const handleExec = async () => {
    setIsExecuting(true);
    setResult("");
    setError("");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const response = await fetch("/api/system/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
        signal: controller.signal,
      });
      if (!response.body) {
        setIsExecuting(false);
        setError(t.common.error);
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          const chunk = decoder.decode(value);
          setResult((prev) => prev + chunk);
        }
      }
      reader.releaseLock();
    } catch (e: unknown) {
      if (typeof e === 'object' && e && 'name' in e && (e as any).name !== 'AbortError') {
        setError(t.common.networkError + ((e as any).message ? `: ${(e as any).message}` : ""));
      }
    } finally {
      setIsExecuting(false);
      abortControllerRef.current = null;
    }
  };

  const stopExec = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsExecuting(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(8px)",
        animation: "fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel"
        style={{
          width: "100%",
          maxWidth: "700px",
          minHeight: "320px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 40px 100px -20px var(--color-shadow)",
          position: "relative",
          border: "1px solid var(--color-surface-border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex-between"
          style={{
            padding: "0.75rem 1.25rem",
            background: "var(--color-surface-bg)",
            borderBottom: "1px solid var(--color-surface-border)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "1rem" }}>
            {t.docker.title + " - " + (t.docker.exec || "执行命令")}
          </span>
          <button className="btn btn-ghost" onClick={onClose} style={{ width: 32, height: 32, padding: 0 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: "1rem", flex: 1, overflow: "auto", background: "var(--color-bg)" }}>
          <div style={{ marginBottom: "0.5rem", fontFamily: "monospace", color: "var(--color-primary)" }}>
            $ {command}
          </div>
          <div
            ref={resultRef}
            style={{
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              background: 'var(--color-surface-bg)',
              color: 'var(--color-text)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-surface-border)',
              padding: '1rem',
              minHeight: '120px',
              maxHeight: '300px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {result || (isExecuting ? t.common.loading + '...' : t.common.none || '无输出')}
          </div>
          {error && <div style={{ color: 'var(--color-danger)', marginTop: '0.5rem' }}>{error}</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--color-surface-border)' }}>
          {isExecuting ? (
            <button className="btn btn-danger" onClick={stopExec}>
              <Square size={16} style={{ marginRight: 6 }} /> {t.common.stop}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleExec}>
              <Play size={16} style={{ marginRight: 6 }} /> {t.common.run}
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>{t.common.close}</button>
        </div>
      </div>
    </div>
  );
}
