'use client';

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyRound, RefreshCw, Shield, ExternalLink, AlertCircle, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  created_at?: number;
}

export interface AuthCardProps {
  onSuccess: (token: AuthToken) => void;
  onAuthStateChange?: (isAuthenticating: boolean) => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  onSuccess,
  onAuthStateChange,
}: AuthCardProps): React.JSX.Element => {
  const [loading, setLoading] = useState<boolean>(false);
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    let unlisten: (() => void) | undefined;

    // 监听 Tauri 2 后端发射的 oauth-success 事件
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

  const handleStartOAuth = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      onAuthStateChange?.(true);
      await invoke<string>('start_google_oauth', { clientId: null, clientSecret: null });
      if (isMountedRef.current) {
        setIsWaiting(true);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(typeof err === 'string' ? err : '拉起浏览器 OAuth 授权失败，请检查网络代理设置');
        onAuthStateChange?.(false);
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  return (
    <div className="flex-1 h-full bg-background flex items-center justify-center p-6 select-none relative overflow-hidden">
      <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl relative z-10 animate-shimmer-pulse">
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 mb-1">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-100">绑定 Google 账号凭证</h2>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            无需手动填写 Gemini API Key。使用原生网页 OAuth2 授权回调流，凭证将持久化留存于本地 Rust 安全层。
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        {!isWaiting ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
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
            <div className="flex items-center justify-center space-x-2 text-[11px] text-gray-500 pt-2">
              <Shield className="w-3.5 h-3.5 text-brand-400" />
              <span>本地 127.0.0.1 临时端口回调，安全无中转</span>
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
              取消认证并重试
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
};
