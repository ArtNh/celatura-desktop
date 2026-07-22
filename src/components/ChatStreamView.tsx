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
      content: '欢迎使用 Celatura 桌面客户端。谷歌 OAuth 身份凭证已安全建立，当前已就绪，随时精雕您的 AI 对话任务。',
      timestamp: '00:05',
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

    // 模拟 Assistant 流式响应
    setTimeout(() => {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        sender: 'assistant',
        content: `已接收指令："${input}"。Tauri 2 Rust 网络层将全权负责调用 Gemini 原生 API。`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    }, 600);
  };

  return (
    <div className="flex-1 h-full bg-background flex flex-col justify-between overflow-hidden select-none">
      {/* 顶部模型控制栏 */}
      <header className="h-14 border-b border-surface-border px-6 flex items-center justify-between bg-surface/30 backdrop-blur">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface border border-surface-border text-xs text-gray-200">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            <span className="font-medium">Gemini 1.5 Pro</span>
          </div>
          <span className="text-[11px] text-gray-500 font-mono">OAuth 安全中转链路</span>
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
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  isUser ? 'bg-brand-600 text-white' : 'bg-surface border border-surface-border text-brand-500'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-xl space-y-1 ${isUser ? 'text-right' : ''}`}>
                <div
                  className={`inline-block p-4 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-brand-600 text-white rounded-tr-none'
                      : 'bg-surface border border-surface-border text-gray-200 rounded-tl-none'
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

      {/* 底部输入控制区 */}
      <footer className="p-6 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto bg-surface border border-surface-border rounded-2xl p-3 shadow-xl focus-within:border-brand-500/50 transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入对话或指令 (Shift + Enter 换行)..."
            rows={2}
            className="w-full bg-transparent text-xs text-gray-100 placeholder-gray-500 resize-none outline-none px-2"
          />

          <div className="flex items-center justify-between pt-2 border-t border-surface-border/40 px-1">
            <div className="flex items-center space-x-1">
              <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors">
                <ImageIcon className="w-4 h-4" />
              </button>
              <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors">
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
