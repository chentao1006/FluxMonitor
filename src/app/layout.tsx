import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flux | macOS Dashboard",
  description: "Flux - A minimalist and powerful macOS system monitoring and management panel",
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
