'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sidebar, ChatSession } from '@/components/Sidebar';
import { ChatStreamView, Message } from '@/components/ChatStreamView';
import { SettingsModal } from '@/components/SettingsModal';

export interface AppSessionsStore {
  sessions: ChatSession[];
  active_session_id: string;
  current_workspace: string | null;
}

export default function Home(): React.JSX.Element {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string>('session_default');
  const [currentWorkspace, setCurrentWorkspace] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 初始化软件启动，读取本地 JSON 仓储恢复现场
  useEffect(() => {
    const initLoadStore = async () => {
      try {
        const store = await invoke<AppSessionsStore>('load_sessions_store');
        if (store && store.sessions && store.sessions.length > 0) {
          setSessions(store.sessions);
          setActiveSessionId(store.active_session_id || store.sessions[0].id);
          setCurrentWorkspace(store.current_workspace || null);
        }
      } catch (err) {
        console.warn('读取本地对话历史仓储失败:', err);
      } finally {
        setIsLoaded(true);
      }
    };

    initLoadStore();
  }, []);

  // 保存最新仓储到本地文件
  const persistStore = async (
    updatedSessions: ChatSession[],
    activeId: string,
    wsPath: string | null
  ) => {
    try {
      await invoke('save_sessions_store', {
        store: {
          sessions: updatedSessions,
          active_session_id: activeId,
          current_workspace: wsPath,
        },
      });
    } catch (err) {
      console.warn('保存本地对话历史失败:', err);
    }
  };

  // 新建对话任务
  const handleNewChat = () => {
    const newId = `session_${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: '新建 AI 对话任务',
      updated_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      messages: [
        {
          id: `welcome_${newId}`,
          sender: 'assistant',
          content: '已为您创建全新的 AI 对话上下文。下达指令后系统将开启多流式处理。',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    };

    const newSessions = [newSession, ...sessions];
    setSessions(newSessions);
    setActiveSessionId(newId);
    persistStore(newSessions, newId, currentWorkspace);
  };

  // 删除对话任务
  const handleDeleteSession = (id: string) => {
    if (sessions.length <= 1) return;
    const newSessions = sessions.filter((s) => s.id !== id);
    const nextActiveId = activeSessionId === id ? newSessions[0].id : activeSessionId;

    setSessions(newSessions);
    setActiveSessionId(nextActiveId);
    persistStore(newSessions, nextActiveId, currentWorkspace);
  };

  // 切换选中对话
  const handleSelectSession = (id: string) => {
    setActiveSessionId(id);
    persistStore(sessions, id, currentWorkspace);
  };

  // 切换工作区路径
  const handleWorkspaceChange = (ws: string) => {
    setCurrentWorkspace(ws);
    persistStore(sessions, activeSessionId, ws);
  };

  // 对话消息列表或 Token 更新
  const handleMessagesUpdate = (sessionId: string, updatedMsgs: Message[]) => {
    setSessions((prevSessions) => {
      const newSessions = prevSessions.map((s) => {
        if (s.id === sessionId) {
          // 如果是默认标题，尝试从首条用户提问中自动生成精致会话标题
          let title = s.title;
          if (title === '新建 AI 对话任务' || title === 'Celatura 智能体交互对话') {
            const firstUserMsg = updatedMsgs.find((m) => m.sender === 'user');
            if (firstUserMsg && firstUserMsg.content.trim()) {
              title = firstUserMsg.content.trim().slice(0, 18);
            }
          }

          return {
            ...s,
            title,
            messages: updatedMsgs,
            updated_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
        }
        return s;
      });

      persistStore(newSessions, activeSessionId, currentWorkspace);
      return newSessions;
    });
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  if (!isLoaded || !activeSession) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background text-gray-400 text-xs font-mono">
        正在读取本地 JSON 数据库，还原 Celatura 工作区现场...
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background">
      {/* 左侧常驻工作台侧边栏 */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 右侧主工作区：绑定持久化仓储 */}
      <ChatStreamView
        key={activeSession.id}
        activeSession={activeSession}
        workspace={currentWorkspace}
        onWorkspaceChange={handleWorkspaceChange}
        onMessagesUpdate={handleMessagesUpdate}
      />

      {/* 极简暗黑毛玻璃多模型凭证与引擎设置弹窗 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </main>
  );
}
