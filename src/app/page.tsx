'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar } from '@/components/Sidebar';
import { AuthCard } from '@/components/AuthCard';
import { ChatStreamView } from '@/components/ChatStreamView';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [activeSessionId, setActiveSessionId] = useState<string>('1');

  // 初始化检查本地 Rust 加密栈中的身份凭证
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const state: any = await invoke('get_auth_state');
        if (state && state.is_authenticated) {
          setIsAuthenticated(true);
        }
      } catch (e) {
        // 开发环境退回安全检查
      }
    };
    checkAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await invoke('logout');
    } catch (e) {}
    setIsAuthenticated(false);
  };

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 左侧常驻工作台侧边栏 */}
      <Sidebar
        isAuthenticated={isAuthenticated}
        onLogout={handleLogout}
        onNewChat={() => setActiveSessionId(Date.now().toString())}
        activeSessionId={activeSessionId}
        onSelectSession={(id) => setActiveSessionId(id)}
      />

      {/* 右侧主工作区：未登录展现 AuthCard，已登录展示 ChatStreamView */}
      {isAuthenticated ? (
        <ChatStreamView key={activeSessionId} />
      ) : (
        <AuthCard onSuccess={() => setIsAuthenticated(true)} />
      )}
    </main>
  );
}
