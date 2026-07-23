'use client';

import React, { useState } from 'react';
import { Sidebar } from '@/components/Sidebar';
import { ChatStreamView } from '@/components/ChatStreamView';
import { SettingsModal } from '@/components/SettingsModal';

export default function Home(): React.JSX.Element {
  const [activeSessionId, setActiveSessionId] = useState<string>('1');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 左侧常驻工作台侧边栏 */}
      <Sidebar
        onNewChat={() => setActiveSessionId(Date.now().toString())}
        activeSessionId={activeSessionId}
        onSelectSession={(id: string) => setActiveSessionId(id)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 右侧主工作区：无感直达多模型智能体工作台 */}
      <ChatStreamView key={activeSessionId} />

      {/* 极简暗黑毛玻璃多模型凭证与引擎设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </main>
  );
}
