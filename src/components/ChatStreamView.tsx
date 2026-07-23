'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  User,
  FolderOpen,
  Copy,
  Check,
  Code2,
  Terminal,
  Loader2,
  ChevronDown,
  Zap,
  Globe,
  FolderCheck,
  Trash2,
  ChevronUp,
  PlayCircle,
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
  task_id: string;
  chunk: string;
  is_done: boolean;
  is_error: boolean;
}

interface TerminalLogPayload {
  task_id: string;
  command: string;
  log: string;
  is_done: boolean;
  exit_code?: number;
}

/// 支持的核心大语言模型提供商定义
const AVAILABLE_MODELS = [
  { id: 'Gemini 1.5 Pro', name: 'Gemini 1.5 Pro (CLI Native)', provider: 'gemini', icon: Sparkles, color: 'text-brand-400' },
  { id: 'Gemini 1.5 Flash', name: 'Gemini 1.5 Flash', provider: 'gemini', icon: Sparkles, color: 'text-emerald-400' },
  { id: 'DeepSeek V3 / R1', name: 'DeepSeek V3 / R1 Reasoning', provider: 'deepseek', icon: Zap, color: 'text-sky-400' },
  { id: 'Custom OpenAI', name: 'Custom OpenAI-Compatible', provider: 'openai', icon: Globe, color: 'text-purple-400' },
];

/// 自定义高阶代码块容器（包含语言标签与一键复制功能）
const CodeBlock: React.FC<{ language: string; value: string }> = ({ language, value }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制代码失败:', err);
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
          className="flex items-center space-x-1 px-2.5 py-1 rounded-md bg-surface-hover hover:bg-white/10 text-gray-300 transition-colors"
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
        '欢迎使用 **Celatura 多模型 Agent 极速中转工作台**。\n\n系统已重构强化：\n1. **系统级 Tool Calling 支持**：支持通过在对话中下达命令（如 `exec: npm run build`）直接利用 `tokio::process::Command` 在当前工作区执行终端系统命令。\n2. **控制台实时推流**：下方集成暗黑控制台组件，零延迟同步显示系统真实的构建与测试日志。',
      timestamp: '00:00',
    },
  ]);
  const [input, setInput] = useState<string>('');
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<string>('Gemini 1.5 Pro');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);

  // 📟 本地控制台日志小组件状态
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [activeCommand, setActiveCommand] = useState<string | null>(null);
  const [showTerminalConsole, setShowTerminalConsole] = useState<boolean>(false);
  const [isTerminalExecuting, setIsTerminalExecuting] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (showTerminalConsole) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs, showTerminalConsole]);

  // 监听 Tauri 2 后端发射的 gemini-stream 与 terminal-log 流式事件
  useEffect(() => {
    let unlistenStream: (() => void) | undefined;
    let unlistenTerminal: (() => void) | undefined;

    const setupListeners = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        
        // 1. 大模型文本 Token 流监听
        unlistenStream = await listen<GeminiStreamPayload>('gemini-stream', (event) => {
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

        // 2. 本地系统终端控制台日志推流监听
        unlistenTerminal = await listen<TerminalLogPayload>('terminal-log', (event) => {
          const { command, log, is_done } = event.payload;
          setActiveCommand(command);
          setShowTerminalConsole(true);
          setIsTerminalExecuting(!is_done);
          setTerminalLogs((prev) => [...prev, log]);
        });
      } catch (err) {
        console.warn('当前运行于纯 Web 模式或 Tauri API 未初始化:', err);
      }
    };

    setupListeners();

    return () => {
      if (unlistenStream) unlistenStream();
      if (unlistenTerminal) unlistenTerminal();
    };
  }, []);

  // 选择本地项目工作区目录
  const handleSelectWorkspace = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 AI 智能体感知的本地代码库/工作区目录',
      });

      if (selected && typeof selected === 'string') {
        setWorkspace(selected);
      }
    } catch (err) {
      console.warn('选择工作区路径发生警告或暂不可用:', err);
    }
  };

  // 发送对话任务指令
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

    const activeModelObj = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('execute_llm_task', {
        prompt: userPrompt,
        currentWorkspace: workspace,
        taskId: taskId,
        model: selectedModel,
        provider: activeModelObj.provider,
      });
    } catch (err: any) {
      console.error('调用 execute_llm_task 发生错误:', err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === taskId
            ? {
                ...m,
                content: `执行失败或无法拉起底层大模型通信管道: ${err?.message || err}`,
                isStreaming: false,
                isError: true,
              }
            : m
        )
      );
      setIsProcessing(false);
    }
  };

  const activeModelObj = AVAILABLE_MODELS.find((m) => m.id === selectedModel) || AVAILABLE_MODELS[0];
  const IconComp = activeModelObj.icon;

  return (
    <div className="flex-1 h-full bg-background flex flex-col justify-between overflow-hidden select-none">
      {/* 顶部 Header：模型切换下拉框与工作区绑定控制器 */}
      <header className="h-14 border-b border-surface-border/80 px-6 flex items-center justify-between bg-surface/30 backdrop-blur-md relative z-20">
        <div className="flex items-center space-x-3">
          {/* 下拉模型选择列表 */}
          <div className="relative">
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-surface border border-surface-border hover:border-brand-500/50 text-xs text-gray-200 transition-colors shadow-sm"
            >
              <IconComp className={`w-3.5 h-3.5 ${activeModelObj.color}`} />
              <span className="font-medium">{activeModelObj.name}</span>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            <AnimatePresence>
              {isModelDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute top-full left-0 mt-1 w-64 bg-[#0f111a] border border-surface-border/90 rounded-xl p-1.5 shadow-2xl z-30"
                >
                  <div className="px-2 py-1 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                    提供商与目标模型路由
                  </div>
                  {AVAILABLE_MODELS.map((item) => {
                    const ItemIcon = item.icon;
                    const isSelected = item.id === selectedModel;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedModel(item.id);
                          setIsModelDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs transition-colors ${
                          isSelected
                            ? 'bg-brand-600/20 text-brand-300 font-medium'
                            : 'text-gray-300 hover:bg-surface-hover hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <ItemIcon className={`w-3.5 h-3.5 ${item.color}`} />
                          <span>{item.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-brand-400" />}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <span className="text-[11px] text-gray-500 font-mono hidden sm:inline">Tauri 2 SSE Stream Engine</span>
        </div>

        {/* 精美工作区感知绑定按钮与常驻卡片 */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSelectWorkspace}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs transition-all shadow-sm active:scale-95 ${
              workspace
                ? 'bg-brand-500/10 border-brand-500/40 text-brand-300 font-medium'
                : 'border-surface-border/80 bg-surface/60 hover:bg-surface text-gray-300 hover:text-white'
            }`}
            title="点击选择本地项目目录，AI 将自动扫描架构并提取依赖 Context"
          >
            {workspace ? (
              <FolderCheck className="w-3.5 h-3.5 text-brand-400" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 text-gray-400" />
            )}
            <span className="font-mono max-w-[220px] truncate">
              {workspace ? `Celatura: ${workspace.split(/[/\\]/).pop() || workspace}` : '选择本地项目工作区'}
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
                      {msg.content || (msg.isStreaming ? '正在接收实时 Token 流...' : '')}
                    </ReactMarkdown>
                  )}
                  {msg.isStreaming && (
                    <span className="inline-flex items-center ml-2 text-brand-400 animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                      思考推演中...
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

      {/* 📟 本地控制台日志小组件（暗黑极简可折叠终端） */}
      <AnimatePresence>
        {showTerminalConsole && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-6 pb-2"
          >
            <div className="bg-[#06080e] border border-surface-border/90 rounded-xl overflow-hidden shadow-2xl">
              {/* 控制台 Bar */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#0a0d17] border-b border-surface-border/50 text-[11px] font-mono text-gray-400">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-3.5 h-3.5 text-brand-400" />
                  <span className="text-gray-200 font-semibold">📟 本地控制台日志</span>
                  {activeCommand && (
                    <span className="text-[10px] bg-brand-500/20 text-brand-300 px-2 py-0.5 rounded border border-brand-500/30 truncate max-w-[240px]">
                      {activeCommand}
                    </span>
                  )}
                  {isTerminalExecuting && (
                    <span className="flex items-center text-[10px] text-amber-400 animate-pulse">
                      <PlayCircle className="w-3 h-3 mr-1 animate-spin" />
                      运行中...
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setTerminalLogs([])}
                    className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    title="清空控制台日志"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setShowTerminalConsole(false)}
                    className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    title="收起控制台"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 日志内容滚动区 */}
              <div className="p-3 max-h-40 overflow-y-auto font-mono text-[11px] leading-relaxed text-emerald-400 selection:bg-brand-500/40">
                {terminalLogs.length === 0 ? (
                  <div className="text-gray-600 italic">等待系统终端日志输出...</div>
                ) : (
                  terminalLogs.map((log, idx) => (
                    <div key={idx} className="whitespace-pre-wrap">
                      {log}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部任务对话输入框 */}
      <footer className="p-6 pt-2 bg-gradient-to-t from-background via-background to-transparent">
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
                ? `在工作区 [${workspace.split(/[/\\]/).pop()}] 中下达 AI 对话任务 (输入 exec: 命令可在本地终端执行)...`
                : `由 [${selectedModel}] 下达对话任务 (建议先在右上角选定项目工作区)...`
            }
            rows={2}
            className="w-full bg-transparent text-xs text-gray-100 placeholder-gray-500 resize-none outline-none px-2"
          />

          <div className="flex items-center justify-between pt-2 border-t border-surface-border/40 px-1">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-mono">
              <button
                onClick={() => setShowTerminalConsole(!showTerminalConsole)}
                className="flex items-center space-x-1 hover:text-brand-400 transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-brand-400" />
                <span className="text-[11px] text-gray-400">控制台 ({terminalLogs.length})</span>
              </button>
              <span className="text-[11px] text-gray-600">|</span>
              <span className="text-[11px] text-gray-500 truncate max-w-[200px]">
                {workspace ? `Context: ${workspace}` : '未注入上下文'}
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
