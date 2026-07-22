'use client';

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  KeyRound,
  RefreshCw,
  Shield,
  ExternalLink,
  AlertCircle,
  Sparkles,
  Save,
  Check,
  Eye,
  EyeOff,
  Settings,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  created_at?: number;
}

export interface ClientCredentials {
  client_id: string;
  client_secret: string;
}

export interface AuthCardProps {
  onSuccess: (token: AuthToken) => void;
  onAuthStateChange?: (isAuthenticating: boolean) => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  onSuccess,
  onAuthStateChange,
}: AuthCardProps): React.JSX.Element => {
  // 凭证配置状态
  const [clientId, setClientId] = useState<string>('');
  const [clientSecret, setClientSecret] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [hasExistingCreds, setHasExistingCreds] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(true);

  // 认证流程状态
  const [loading, setLoading] = useState<boolean>(false);
  const [savingCreds, setSavingCreds] = useState<boolean>(false);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  // 初始化检查本地是否已存在保存的 Client ID 和 Secret
  useEffect(() => {
    isMountedRef.current = true;

    const checkSavedCredentials = async () => {
      try {
        const creds = await invoke<ClientCredentials | null>('load_client_credentials');
        if (isMountedRef.current && creds && creds.client_id) {
          setClientId(creds.client_id);
          setClientSecret(creds.client_secret || '');
          setHasExistingCreds(true);
          setShowConfig(false); // 已有配置时默认收起配置面板
        }
      } catch (err) {
        console.warn('检查本地 OAuth 客户端配置失败:', err);
      }
    };

    checkSavedCredentials();

    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<AuthToken>('oauth-success', (event) => {
          if (!isMountedRef.current) return;
          setIsWaiting(false);
          setLoading(false);
          onAuthStateChange?.(false);
          onSuccess(event.payload);
        });
      } catch (err) {
        console.warn('OAuth 事件监听初始化未就绪:', err);
      }
    };

    setupListener();

    return () => {
      isMountedRef.current = false;
      if (unlisten) unlisten();
    };
  }, [onSuccess, onAuthStateChange]);

  // 保存凭证
  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setErrorMsg('请填写完整的 Client ID 和 Client Secret');
      return;
    }

    setSavingCreds(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      await invoke('save_client_credentials', {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      if (isMountedRef.current) {
        setIsSaved(true);
        setHasExistingCreds(true);
        setSuccessMsg('Google OAuth 客户端凭证已加密保存！');
        setTimeout(() => {
          if (isMountedRef.current) {
            setIsSaved(false);
            setSuccessMsg(null);
          }
        }, 3000);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(typeof err === 'string' ? err : '保存配置发生错误');
      }
    } finally {
      if (isMountedRef.current) setSavingCreds(false);
    }
  };

  // 触发浏览器网页 OAuth
  const handleStartOAuth = async () => {
    if (!hasExistingCreds && (!clientId.trim() || !clientSecret.trim())) {
      setErrorMsg('请先填写并保存您的 Google Client ID 与 Secret');
      setShowConfig(true);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      onAuthStateChange?.(true);
      await invoke<string>('start_google_oauth', {
        clientId: clientId.trim() || null,
        clientSecret: clientSecret.trim() || null,
      });
      if (isMountedRef.current) {
        setIsWaiting(true);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(typeof err === 'string' ? err : '唤起浏览器授权失败，请检查客户端配置或代理');
        onAuthStateChange?.(false);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-background flex items-center justify-center p-6 select-none relative overflow-hidden">
      <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl relative z-10 animate-shimmer-pulse">
        {/* 卡片头部 */}
        <div className="text-center space-y-3 mb-6">
          <div className="inline-flex p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 mb-1">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-100">绑定 Google 账号凭证</h2>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            自定义配置您的 Google Cloud OAuth 客户端。本地直接建立 127.0.0.1 回调通道，安全零中转。
          </p>
        </div>

        {/* 提示反馈信息 */}
        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center space-x-2">
            <Check className="w-4 h-4 shrink-0" />
            <span className="flex-1">{successMsg}</span>
          </div>
        )}

        {/* 未处于等待登录阶段 */}
        {!isWaiting ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            {/* 配置展开/折叠面板头 */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-1.5 text-xs text-gray-300 font-medium">
                <Settings className="w-3.5 h-3.5 text-brand-400" />
                <span>OAuth 客户端设置</span>
              </div>
              {hasExistingCreds && (
                <button
                  onClick={() => setShowConfig(!showConfig)}
                  className="text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {showConfig ? '收起配置' : '修改凭证'}
                </button>
              )}
            </div>

            {/* 配置输入表单 */}
            <AnimatePresence>
              {showConfig && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 bg-surface/50 p-4 rounded-xl border border-surface-border/80"
                >
                  {/* Client ID */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-gray-400">Google Client ID</label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      placeholder="xxx.apps.googleusercontent.com"
                      className="w-full bg-[#0a0b10] border border-surface-border focus:border-brand-500/60 rounded-lg px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 outline-none transition-colors"
                    />
                  </div>

                  {/* Client Secret */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-gray-400">Google Client Secret</label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="GOCSPX-xxxxxxxxxxxx"
                        className="w-full bg-[#0a0b10] border border-surface-border focus:border-brand-500/60 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* 保存配置按钮 */}
                  <button
                    onClick={handleSaveCredentials}
                    disabled={savingCreds}
                    className="w-full py-2 px-3 mt-1 rounded-lg bg-surface border border-surface-border hover:bg-surface-border text-gray-200 font-medium text-xs transition-all flex items-center justify-center space-x-1.5 active:scale-[0.98] disabled:opacity-50"
                  >
                    {savingCreds ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : isSaved ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Save className="w-3.5 h-3.5 text-brand-400" />
                    )}
                    <span>{isSaved ? '凭证已成功保存' : '保存 OAuth 凭证到本地'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 登录按钮 */}
            <div className="pt-1">
              <button
                onClick={handleStartOAuth}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white font-medium text-sm transition-all shadow-lg shadow-brand-600/25 flex items-center justify-center space-x-2 active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在唤起系统浏览器...</span>
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    <span>使用浏览器登录 Google</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center space-x-2 text-[11px] text-gray-500 pt-1">
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              <span>凭证安全加密存放于本地本地 config 目录</span>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center">
            <div className="p-4 rounded-xl bg-surface-hover/80 border border-surface-border space-y-3">
              <div className="flex items-center justify-center space-x-2 text-brand-400 font-medium text-sm">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>授权页面已在浏览器中打开</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                请在弹出的系统默认浏览器中完成 Google 账号登录。登录成功后，凭证将自动推送到 Celatura 客户端。
              </p>
            </div>

            <div className="flex items-center justify-center space-x-2.5 py-2 text-xs text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-500" />
              <span>正在等待本地 HTTP 接收回调凭证...</span>
            </div>

            <button
              onClick={() => {
                setIsWaiting(false);
                onAuthStateChange?.(false);
              }}
              className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-4"
            >
              取消认证并重写配置
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};
