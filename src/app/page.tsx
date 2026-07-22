'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from '@/components/Sidebar';
import { AuthCard } from '@/components/AuthCard';
import { ChatStreamView } from '@/components/ChatStreamView';

export default function Home(): React.JSX.Element {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthenticating, setIsAuthenticating] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('1');

  useEffect(() => {
    const initCheckToken = async () => {
      try {
        const token: any = await invoke('load_token');
        if (token && token.access_token) {
          setIsAuthenticated(true);
        }
      } catch (err) {
        // 开发环境容错处理
      }
    };

    initCheckToken();
  }, []);

  const handleLogout = async () => {
    try {
      await invoke('clear_token');
    } catch (e) {}
    setIsAuthenticated(false);
    setIsAuthenticating(false);
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 左侧常驻工作台侧边栏 */}
      <Sidebar
        isAuthenticated={isAuthenticated}
        isAuthenticating={isAuthenticating}
        onLogout={handleLogout}
        onNewChat={() => setActiveSessionId(Date.now().toString())}
        activeSessionId={activeSessionId}
        onSelectSession={(id: string) => setActiveSessionId(id)}
      />

      {/* 右侧主工作区：未登录渲染 AuthCard，已登录进入 ChatStreamView */}
      {isAuthenticated ? (
        <ChatStreamView key={activeSessionId} />
      ) : (
        <AuthCard
          onSuccess={() => {
            setIsAuthenticated(true);
            setIsAuthenticating(false);
          }}
          onAuthStateChange={(authenticating: boolean) => setIsAuthenticating(authenticating)}
        />
      )}
    </main>
  );
}
