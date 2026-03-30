"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { translations } from './translations';
import { AppConfig } from './types';

interface SettingsContextType {
  config: AppConfig | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateConfig: (newConfig: AppConfig) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setConfig(data.data as AppConfig);
      } else {
        setConfig({ users: [], ai: {}, features: {} });
      }
    } catch (e) {
      const lang = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      const t = translations[lang] || translations.zh;
      console.error(t.common.settingsFetchFailed, e);
      setConfig({ users: [], ai: {}, features: {} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateConfig = (newConfig: AppConfig) => {
    setConfig(newConfig);
  };

  return (
    <SettingsContext.Provider value={{ config, loading, refreshSettings: fetchSettings, updateConfig }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
