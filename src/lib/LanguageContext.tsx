"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
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

  // 初始化逻辑
  useEffect(() => {
    const getCookie = (name: string) => {
      const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? match[2] : null;
    };

    const savedLang = (getCookie('app-language') || localStorage.getItem('app-language')) as Language | 'auto';
    let langToUse: Language = 'zh';

    if (savedLang && savedLang !== 'auto') {
      langToUse = savedLang as Language;
      setLanguage(savedLang as Language);
    } else {
      setLanguage('auto');
      const systemLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'zh';
      langToUse = systemLang.startsWith('zh') ? 'zh' : 'en';
    }

    setEffectiveLang(langToUse);
  }, []);

  // 语言变更同步
  useEffect(() => {
    if (language !== 'auto') {
      setEffectiveLang(language);
    } else if (typeof navigator !== 'undefined') {
      const systemLang = navigator.language.toLowerCase();
      setEffectiveLang(systemLang.startsWith('zh') ? 'zh' : 'en');
    }
  }, [language]);

  const handleSetLanguage = (lang: Language | 'auto') => {
    setLanguage(lang);
    if (lang === 'auto') {
      localStorage.removeItem('app-language');
      document.cookie = "app-language=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    } else {
      localStorage.setItem('app-language', lang);
      // 写入 Cookie 供服务端生成 Metadata (有效期1年)
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1);
      document.cookie = `app-language=${lang}; path=/; expires=${date.toUTCString()}; samesite=lax`;
    }
    // 强制刷新，使服务端能够重新通过 Cookie 生成正确的元数据
    window.location.reload();
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
