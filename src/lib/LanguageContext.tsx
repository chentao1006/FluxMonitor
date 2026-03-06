"use client";

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { translations, Language, TranslationKeys } from './translations';

interface LanguageContextType {
  language: Language | 'auto';
  effectiveLang: Language;
  setLanguage: (lang: Language | 'auto') => void;
  t: TranslationKeys;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language | 'auto'>('auto');
  const [effectiveLang, setEffectiveLang] = useState<Language>('zh');

  useEffect(() => {
    const savedLang = localStorage.getItem('app-language') as Language | 'auto';
    if (savedLang) {
      setLanguage(savedLang);
    }
  }, []);

  useEffect(() => {
    if (language === 'auto') {
      const systemLang = navigator.language.toLowerCase();
      if (systemLang.startsWith('zh')) {
        setEffectiveLang('zh');
      } else {
        setEffectiveLang('en');
      }
    } else {
      setEffectiveLang(language);
    }
  }, [language]);

  const handleSetLanguage = (lang: Language | 'auto') => {
    setLanguage(lang);
    if (lang === 'auto') {
      localStorage.removeItem('app-language');
    } else {
      localStorage.setItem('app-language', lang);
    }
  };

  const value = {
    language,
    effectiveLang,
    setLanguage: handleSetLanguage,
    t: translations[effectiveLang] as TranslationKeys,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
