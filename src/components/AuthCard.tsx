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
  Zap,
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

// 默认公开的 Google 桌面应用 Client ID 常量（开源桌面应用标准规范）
const PUBLIC_DESKTOP_CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

export const AuthCard: React.FC<AuthCardProps> = ({
  onSuccess,
  onAuthStateChange,
}: AuthCardProps): React.JSX.Element => {
  const [clientId, setClientId] = useState<string>(PUBLIC_DESKTOP_CLIENT_ID);
  const [clientSecret, setClientSecret] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [hasExistingCreds, setHasExistingCreds] = useState<boolean>(false);
  const [showConfig, setShowConfig] = useState<boolean>(false);

  const [loading, setLoading] = useState<boolean>(false);
  const [savingCreds, setSavingCreds] = useState<boolean>(false);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;

    const checkSavedCredentials = async () => {
      try {
        const creds = await invoke<ClientCredentials | null>('load_client_credentials');
        if (isMountedRef.current && creds && creds.client_id) {
          setClientId(creds.client_id);
          setClientSecret(creds.client_secret || '');
          setHasExistingCreds(true);
        }
      } catch (err) {
        console.warn('读取客户端凭证失败:', err);
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
        console.warn('OAuth 事件监听未能就绪:', err);
      }
    };

    setupListener();

    return () => {
      isMountedRef.current = false;
      if (unlisten) unlisten();
    };
  }, [onSuccess, onAuthStateChange]);

  const handleSaveCredentials = async () => {
    if (!clientId.trim()) {
      setErrorMsg('请填写 Client ID');
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
        setSuccessMsg('客户端凭证已成功保存至本地安全存储');
        setTimeout(() => {
          if (isMountedRef.current) {
            setIsSaved(false);
            setSuccessMsg(null);
          }
        }, 3000);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(typeof err === 'string' ? err : '保存凭证配置发生错误');
      }
    } finally {
      if (isMountedRef.current) setSavingCreds(false);
    }
  };

  // 触发操作系统原生 Deep Link (celatura://) 登录
  const handleStartOAuthDeepLink = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      onAuthStateChange?.(true);
      await invoke<string>('start_google_oauth_deeplink', {
        clientId: clientId.trim() || null,
      });
      if (isMountedRef.current) {
        setIsWaiting(true);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(typeof err === 'string' ? err : '唤起系统浏览器 Deep Link 失败');
        onAuthStateChange?.(false);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-background flex items-center justify-center p-6 select-none relative overflow-hidden">
      <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl relative z-10 animate-shimmer-pulse">
        {/* 头部 */}
        <div className="text-center space-y-3 mb-6">
          <div className="inline-flex p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 mb-1">
            <Zap className="w-6 h-6 text-brand-400" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-100">绑定 Google 账号凭证</h2>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            采用操作系统原生深层链接（Custom Protocol）唤起流，零本地网络端口暴露。
          </p>
        </div>

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

        {!isWaiting ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            {/* 折叠式高级设置 */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center space-x-1.5 text-xs text-gray-300 font-medium">
                <Settings className="w-3.5 h-3.5 text-brand-400" />
                <span>Client ID 自定义配置</span>
              </div>
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="text-[11px] text-brand-400 hover:text-brand-300 transition-colors"
              >
                {showConfig ? '收起面板' : '高级设置'}
              </button>
            </div>

            <AnimatePresence>
              {showConfig && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3 bg-surface/50 p-4 rounded-xl border border-surface-border/80"
                >
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

                  <div className="space-y-1">
                    <label className="text-[11px] font-mono text-gray-400">Google Client Secret (可选)</label>
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
                    <span>{isSaved ? '凭证已保存' : '保存客户端凭证'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 原生 Deep Link 登录按钮 */}
            <div className="pt-1">
              <button
                onClick={handleStartOAuthDeepLink}
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
                    <span>使用浏览器登录 Google (Deep Link)</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center justify-center space-x-2 text-[11px] text-gray-500 pt-1 font-mono">
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              <span>Protocol: celatura://auth (零端口暴露)</span>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6 text-center">
            <div className="p-4 rounded-xl bg-surface-hover/80 border border-surface-border space-y-3">
              <div className="flex items-center justify-center space-x-2 text-brand-400 font-medium text-sm">
                <Sparkles className="w-4 h-4 animate-pulse" />
                <span>Google 授权页面已打开</span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                在浏览器完成登录后，系统将通过 <code className="text-brand-300 font-mono">celatura://auth</code> 原生深层链接自动唤醒并激活本客户端。
              </p>
            </div>

            <div className="flex items-center justify-center space-x-2.5 py-2 text-xs text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin text-brand-500" />
              <span>等待系统级原生协议唤醒...</span>
            </div>

            <button
              onClick={() => {
                setIsWaiting(false);
                onAuthStateChange?.(false);
              }}
              className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-4"
            >
              取消并重新发起
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};
