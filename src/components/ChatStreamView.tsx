'use client';

import React, { useState } from 'react';
import { Send, Image as ImageIcon, Paperclip, SlidersHorizontal, Sparkles, Bot, User } from 'lucide-react';
import { motion } from 'framer-motion';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const ChatStreamView: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'assistant',
      content: '欢迎使用 Celatura 桌面客户端。Google OAuth2 身份凭证已全量加密建立，Tauri 2 Rust 网络架构就绪，请下达对话任务。',
      timestamp: '00:19',
    },
  ]);
  const [input, setInput] = useState<string>('');

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      sender: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // 模拟流式打字机逐字响应
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        content: `已接收任务指令："${input}"。当前调用的是全量 Gemini 1.5 Pro 模型，所有网络中转由后端 reqwest 独占处理。`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 500);
  };

  return (
    <div className="flex-1 h-full bg-background flex flex-col justify-between overflow-hidden select-none">
      {/* 顶部模型控制栏 */}
      <header className="h-14 border-b border-surface-border/80 px-6 flex items-center justify-between bg-surface/30 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface border border-surface-border text-xs text-gray-200 shadow-sm">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            <span className="font-medium">Gemini 1.5 Pro</span>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">Tauri 2 原生 IPC 链路</span>
        </div>

        <div className="flex items-center space-x-2">
          <button className="p-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 对话消息流展示区 */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-start space-x-3 ${isUser ? 'flex-row-reverse space-x-reverse' : ''}`}
            >
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                  isUser ? 'bg-brand-600 text-white' : 'bg-surface border border-surface-border text-brand-500'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-xl space-y-1 ${isUser ? 'text-right' : ''}`}>
                <div
                  className={`inline-block p-4 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    isUser
                      ? 'bg-brand-600 text-white rounded-tr-none shadow-md shadow-brand-600/10'
                      : 'bg-surface border border-surface-border text-gray-200 rounded-tl-none shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
                <div className="text-[10px] text-gray-500 px-1 font-mono">{msg.timestamp}</div>
              </div>
            </motion.div>
          );
        })}
      </main>

      {/* 底部圆角多模态输入框 */}
      <footer className="p-6 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto bg-surface border border-surface-border/80 rounded-2xl p-3 shadow-2xl focus-within:border-brand-500/50 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入 AI 对话任务 (Shift + Enter 换行)..."
            rows={2}
            className="w-full bg-transparent text-xs text-gray-100 placeholder-gray-500 resize-none outline-none px-2"
          />

          <div className="flex items-center justify-between pt-2 border-t border-surface-border/40 px-1">
            <div className="flex items-center space-x-1">
              <button
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                title="上传本地图片"
              >
                <ImageIcon className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors"
                title="解析本地文档"
              >
                <Paperclip className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSend}
              className="p-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white transition-all shadow-md shadow-brand-600/20 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
