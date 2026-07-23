'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  MessageSquare,
  Plus,
  ShieldCheck,
  ShieldAlert,
  Settings,
  Cpu,
  Sparkles,
  Trash2,
} from 'lucide-react';

export interface ApiKeyStatus {
  gemini_ready: boolean;
  gemini_env_detected: boolean;
  deepseek_ready: boolean;
  custom_ready: boolean;
  has_any_ready: boolean;
  active_model: string;
}

export interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  messages: any[];
}

export interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onOpenSettings,
}: SidebarProps): React.JSX.Element => {
  const [status, setStatus] = useState<ApiKeyStatus | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const st = await invoke<ApiKeyStatus>('check_api_key_status');
      if (st) setStatus(st);
    } catch (err) {
      console.warn('获取 API Key 状态失败:', err);
    }
  };

  return (
    <aside className="w-72 h-full bg-surface border-r border-surface-border flex flex-col justify-between select-none">
      <div className="p-4 space-y-4">
        <div className="flex items-center space-x-3 px-2 py-1">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-brand-accent flex items-center justify-center shadow-lg shadow-brand-500/20">
            <Cpu className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-wide text-gray-100">Celatura</h1>
            <p className="text-[11px] text-gray-500 font-mono">Carve Your AI Workbench</p>
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
          <div className="px-2 pb-2 text-[11px] font-medium text-gray-500 uppercase tracking-wider flex items-center justify-between">
            <span>对话任务历史</span>
            <span className="text-[10px] font-mono text-gray-600">({sessions.length})</span>
          </div>
          <div className="space-y-1 max-h-[380px] overflow-y-auto pr-0.5">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className={`group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-colors ${
                    isActive
                      ? 'bg-surface-hover text-brand-500 font-medium border-l-2 border-brand-500'
                      : 'text-gray-400 hover:bg-surface-hover/50 hover:text-gray-200'
                  }`}
                >
                  <button
                    onClick={() => onSelectSession(session.id)}
                    className="flex items-center space-x-2.5 flex-1 min-w-0 text-left"
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate flex-1">{session.title}</span>
                  </button>

                  {sessions.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-all"
                      title="删除此会话"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-surface-border/60 bg-surface/50 space-y-3">
        {/* 多模型凭证驱动状态指示灯 */}
        <div className="px-3 py-2.5 rounded-lg bg-surface-hover/40 border border-surface-border/40 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            {status?.has_any_ready ? (
              <div className="relative flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
              </div>
            ) : (
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
            )}

            <div className="truncate">
              <div className="text-[11px] font-medium text-gray-200">
                {status?.has_any_ready ? '多模型凭证已就绪' : '未配置 API 凭证'}
              </div>
              <div className="text-[10px] text-gray-400 truncate font-mono">
                {status?.gemini_env_detected
                  ? '系统 GEMINI_API_KEY 点亮'
                  : status?.has_any_ready
                  ? '凭证存储即插即用'
                  : '未感应到环境变量'}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-surface-hover transition-colors"
            title="打开多模型凭证与引擎设置面板"
          >
            <div className="flex items-center space-x-2">
              <Settings className="w-4 h-4 text-brand-400" />
              <span>模型凭证配置</span>
            </div>
            <Sparkles className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>
      </div>
    </aside>
  );
};
