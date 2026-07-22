'use client';

import React from 'react';
import { MessageSquare, Plus, ShieldCheck, ShieldAlert, RefreshCw, LogOut, Settings, Cpu } from 'lucide-react';

export interface SidebarProps {
  isAuthenticated: boolean;
  isAuthenticating?: boolean;
  userEmail?: string;
  onLogout: () => void;
  onNewChat: () => void;
  activeSessionId: string;
  onSelectSession: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isAuthenticated,
  isAuthenticating = false,
  userEmail,
  onLogout,
  onNewChat,
  activeSessionId,
  onSelectSession,
}: SidebarProps): React.JSX.Element => {
  const mockSessions = [
    { id: '1', title: 'Rust reqwest 网络层安全架构设计', time: '10分钟前' },
    { id: '2', title: 'Google OAuth 设备授权流程原理解析', time: '2小时前' },
    { id: '3', title: 'Tauri 2 进程隔离与加密存储', time: '昨天' },
  ];

  return (
    <aside className="w-72 h-full bg-surface border-r border-surface-border flex flex-col justify-between select-none">
      <div className="p-4 space-y-4">
        <div className="flex items-center space-x-3 px-2 py-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-brand-accent flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-gray-100">Celatura</h1>
            <p className="text-[11px] text-gray-500 font-mono">Carve Your AI</p>
          </div>
        </div>

        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-lg bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs transition-all shadow-md shadow-brand-600/10 active:scale-[0.98]"
        >
          <Plus className="w-4 h-4" />
          <span>新建对话任务</span>
        </button>

        <div className="pt-2">
          <div className="px-2 pb-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider">
            对话任务历史
          </div>
          <div className="space-y-1">
            {mockSessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-xs flex items-center space-x-2.5 transition-colors ${
                    isActive
                      ? 'bg-surface-hover text-brand-500 font-medium border-l-2 border-brand-500'
                      : 'text-gray-400 hover:bg-surface-hover/50 hover:text-gray-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{session.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-surface-border/60 bg-surface/50 space-y-3">
        {/* 三态认证指示灯卡片 */}
        <div className="px-3 py-2.5 rounded-lg bg-surface-hover/40 border border-surface-border/40 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            {isAuthenticating ? (
              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            ) : isAuthenticated ? (
              <div className="relative flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
              </div>
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            )}

            <div className="truncate">
              <div className="text-[11px] font-medium text-gray-300">
                {isAuthenticating
                  ? '等待 Google 授权...'
                  : isAuthenticated
                  ? 'Google OAuth 已连接'
                  : '未绑定身份凭证'}
              </div>
              <div className="text-[10px] text-gray-500 truncate">
                {isAuthenticated
                  ? userEmail || 'Gemini 原生 Token 就绪'
                  : isAuthenticating
                  ? '浏览器打卡中'
                  : '免 Key 设备授权'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors">
            <Settings className="w-4 h-4" />
          </button>
          {isAuthenticated && (
            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>注销凭证</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
