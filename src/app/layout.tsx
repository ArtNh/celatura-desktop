import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Celatura - Native Gemini Desktop Client',
  description: 'Carve Your AI Conversation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-background text-foreground antialiased h-screen w-screen overflow-hidden">
        {children}
      </body>
    </html>
  );
}
