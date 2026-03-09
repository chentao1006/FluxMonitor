import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { translations, Language } from "@/lib/translations";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const cookieList = await cookies();
  const langTag = cookieList.get('app-language')?.value as Language | 'auto' | undefined;

  let effectiveLang: Language = 'zh';

  if (langTag && langTag !== 'auto') {
    effectiveLang = langTag as Language;
  } else {
    // 兜底策略：服务端检测 Accept-Language
    const headerList = await headers();
    const acceptLang = headerList.get('accept-language')?.toLowerCase() || '';
    effectiveLang = acceptLang.includes('zh') ? 'zh' : 'en';
  }

  const t = translations[effectiveLang] || translations.zh;

  return {
    title: t.appTitle,
    description: t.appDesc,
  };
}

import { LanguageProvider } from "@/lib/LanguageContext";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
