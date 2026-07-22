'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Image as ImageIcon,
  Paperclip,
  Sparkles,
  Bot,
  User,
  FolderOpen,
  Copy,
  Check,
  Code2,
  Terminal,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  isError?: boolean;
}

interface GeminiStreamPayload {
  task_id: String;
  chunk: String;
  is_done: boolean;
  is_error: boolean;
}

/// 自定义高阶代码块容器（包含语言标签与一键复制功能）
const CodeBlock: React.FC<{ language: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  return (
    <div className="my-3 rounded-xl border border-surface-border/90 bg-[#0d0f17] overflow-hidden shadow-xl">
      <div className="flex items-center justify-between px-4 py-2 bg-surface/80 border-b border-surface-border/50 text-[11px] font-mono text-gray-400">
        <div className="flex items-center space-x-1.5">
          <Code2 className="w-3.5 h-3.5 text-brand-400" />
          <span className="capitalize">{language || 'code'}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-1 rounded-md bg-surface-hover hover:bg-white/10 text-gray-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? '已复制' : '复制代码'}</span>
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed text-gray-200 selection:bg-brand-500/30">
        <pre>{value}</pre>
      </div>
    </div>
  );
};

export const ChatStreamView: React.FC = (): React.JSX.Element => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      content:
        '欢迎使用 **Celatura Native Gemini Client**。项目已打通 Tauri 2 原生 IPC 进程与工作区感知系统。选择本地代码库目录后下达任务，AI 将直接挂载上下文并执行任务。',
      timestamp: '00:00',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 监听 Tauri 2 后端发射的 gemini-stream 流式事件
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<GeminiStreamPayload>('gemini-stream', (event) => {
          const { task_id, chunk, is_done, is_error } = event.payload;

          setMessages((prevMessages) => {
            const index = prevMessages.findIndex((m) => m.id === task_id);
            if (index === -1) return prevMessages;

            const targetMsg = prevMessages[index];
            const updatedContent = targetMsg.content + chunk;

            const updatedMessages = [...prevMessages];
            updatedMessages[index] = {
              ...targetMsg,
              content: updatedContent,
              isStreaming: !is_done,
              isError: is_error,
            };

            return updatedMessages;
          });

          if (is_done) {
            setIsProcessing(false);
          }
        });
      } catch (err) {
        console.warn('当前运行于纯 Web 模式或 Tauri API 未初始化:', err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // 选择本地工作区目录
  const handleSelectWorkspace = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Gemini AI 绑定的本地代码库/工作区目录',
      });

      if (selected && typeof selected === 'string') {
        setWorkspace(selected);
      }
    } catch (err) {
      console.warn('选择工作区路径操作警告:', err);
    }
  };

  // 发送任务指令
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const taskId = `task_${Date.now()}`;
    const userPrompt = input.trim();

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      sender: 'user',
      content: userPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsg: Message = {
      id: taskId,
      sender: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsProcessing(true);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('execute_gemini_task', {
        prompt: userPrompt,
        currentWorkspace: workspace,
        taskId: taskId,
      });
    } catch (err: any) {
      console.error('调用 execute_gemini_task 失败:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === taskId
            ? {
                ...m,
                content: `执行失败或无法拉起 Gemini CLI: ${err?.message || err}`,
                isStreaming: false,
                isError: true,
              }
            : m
        )
      );
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-background flex flex-col justify-between overflow-hidden select-none">
      {/* 顶部 Header：状态与工作区感知选择器 */}
      <header className="h-14 border-b border-surface-border/80 px-6 flex items-center justify-between bg-surface/30 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface border border-surface-border text-xs text-gray-200">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            <span className="font-medium">Gemini 1.5 Pro (CLI Native)</span>
          </div>
          <span className="text-[11px] text-gray-500 font-mono hidden sm:inline">Tauri 2 Async Channel</span>
        </div>

        {/* 工作区路径绑定按钮 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSelectWorkspace}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg border border-surface-border/80 bg-surface/60 hover:bg-surface text-xs text-gray-300 hover:text-white transition-all shadow-sm active:scale-95"
            title="选择 AI 助手执行指令的本地代码库根目录"
          >
            <FolderOpen className="w-3.5 h-3.5 text-brand-400" />
            <span className="font-mono max-w-[200px] truncate">
              {workspace ? workspace.split(/[/\\]/).pop() || workspace : '选择工作区目录'}
            </span>
          </button>
        </div>
      </header>

      {/* 消息历史与流式输出主区域 */}
      <main className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg: Message) => {
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
                  isUser
                    ? 'bg-brand-600 text-white'
                    : msg.isError
                    ? 'bg-red-500/20 border border-red-500/50 text-red-400'
                    : 'bg-surface border border-surface-border text-brand-500'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div className={`max-w-2xl space-y-1 ${isUser ? 'text-right' : ''}`}>
                <div
                  className={`inline-block p-4 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-brand-600 text-white rounded-tr-none whitespace-pre-wrap'
                      : msg.isError
                      ? 'bg-red-950/40 border border-red-500/30 text-red-200 rounded-tl-none'
                      : 'bg-surface border border-surface-border text-gray-200 rounded-tl-none'
                  }`}
                >
                  {isUser ? (
                    msg.content
                  ) : (
                    <ReactMarkdown
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          const codeString = String(children).replace(/\n$/, '');

                          if (!inline && (match || codeString.includes('\n'))) {
                            return <CodeBlock language={match ? match[1] : ''} value={codeString} />;
                          }
                          return (
                            <code className="px-1.5 py-0.5 rounded bg-white/10 text-brand-300 font-mono text-[11px]" {...props}>
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {msg.content || (msg.isStreaming ? '正在生成回复并同步中...' : '')}
                    </ReactMarkdown>
                  )}
                  {msg.isStreaming && (
                    <span className="inline-flex items-center ml-2 text-brand-400 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      思考执行中...
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 px-1 font-mono">{msg.timestamp}</div>
              </div>
            </motion.div>
          );
        })}
        <div ref={messagesEndRef} />
      </main>

      {/* 底部任务对话输入框 */}
      <footer className="p-6 bg-gradient-to-t from-background via-background to-transparent">
        <div className="max-w-3xl mx-auto bg-surface border border-surface-border/80 rounded-2xl p-3 shadow-2xl focus-within:border-brand-500/50 transition-colors">
          <textarea
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              workspace
                ? `在工作区 [${workspace.split(/[/\\]/).pop()}] 下下达 AI 对话任务 (Shift + Enter 换行)...`
                : '输入 AI 对话任务 (建议先在右上角选择工作区目录)...'
            }
            rows={2}
            className="w-full bg-transparent text-xs text-gray-100 placeholder-gray-500 resize-none outline-none px-2"
          />

          <div className="flex items-center justify-between pt-2 border-t border-surface-border/40 px-1">
            <div className="flex items-center space-x-1 text-gray-400 text-xs font-mono">
              <Terminal className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-[11px] text-gray-500">
                {workspace ? `Workspace: ${workspace}` : '未选择工作区'}
              </span>
            </div>

            <button
              onClick={handleSend}
              disabled={isProcessing || !input.trim()}
              className={`p-2 rounded-xl text-white transition-all shadow-md active:scale-95 flex items-center justify-center ${
                isProcessing || !input.trim()
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-brand-600 hover:bg-brand-500 shadow-brand-600/20'
              }`}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
