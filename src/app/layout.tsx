import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flux | 浮光",
  description: "Flux 浮光 - 一个极简且强大的 macOS 系统监控与管理面板",
};

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
