'use client';

import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { KeyRound, Copy, Check, ExternalLink, RefreshCw, Shield, ArrowRight, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface DeviceCodeData {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

export interface AuthToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface PollTokenResponse {
  status: 'success' | 'pending' | 'slow_down' | 'access_denied' | 'expired_token' | 'failed';
  token?: AuthToken;
  error_code?: string;
  error_description?: string;
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
  const [deviceData, setDeviceData] = useState<DeviceCodeData | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // 防内存泄漏 refs (跨环境类型兼容)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  const handleStartAuth = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await invoke<DeviceCodeData>('request_device_code', { clientId: null });
      if (isMountedRef.current) {
        setDeviceData(data);
        setIsPolling(true);
        onAuthStateChange?.(true);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        setErrorMsg(typeof err === 'string' ? err : '获取谷歌授权码失败，请检查网络代理设置');
      }
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleCopyCode = () => {
    if (!deviceData) return;
    navigator.clipboard.writeText(deviceData.user_code);
    setCopied(true);
    setTimeout(() => {
      if (isMountedRef.current) setCopied(false);
    }, 2000);
  };

  const handleOpenBrowser = async () => {
    if (!deviceData) return;
    try {
      await openUrl(deviceData.verification_url);
    } catch (err) {
      window.open(deviceData.verification_url, '_blank');
    }
  };

  useEffect(() => {
    if (!isPolling || !deviceData) return;
    let currentInterval = Math.max(deviceData.interval || 5, 5) * 1000;

    const poll = async () => {
      if (!isMountedRef.current) return;

      try {
        const res = await invoke<PollTokenResponse>('poll_for_token', {
          deviceCode: deviceData.device_code,
          clientId: null,
          clientSecret: null,
        });

        if (!isMountedRef.current) return;

        if (res.status === 'success' && res.token) {
          setIsPolling(false);
          onAuthStateChange?.(false);
          onSuccess(res.token);
          return;
        }

        if (res.status === 'slow_down') {
          currentInterval += 5000;
        } else if (res.status === 'access_denied') {
          setIsPolling(false);
          onAuthStateChange?.(false);
          setErrorMsg('您在谷歌页面拒绝了设备授权');
          return;
        } else if (res.status === 'expired_token') {
          setIsPolling(false);
          onAuthStateChange?.(false);
          setErrorMsg('授权码已过期，请重新点击绑定');
          return;
        } else if (res.status === 'failed') {
          setIsPolling(false);
          onAuthStateChange?.(false);
          setErrorMsg(res.error_description || '轮询过程发生未知错误');
          return;
        }

        if (isMountedRef.current && isPolling) {
          pollTimerRef.current = setTimeout(poll, currentInterval);
        }
      } catch (err: any) {
        if (isMountedRef.current && isPolling) {
          pollTimerRef.current = setTimeout(poll, currentInterval);
        }
      }
    };

    pollTimerRef.current = setTimeout(poll, currentInterval);
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isPolling, deviceData, onSuccess, onAuthStateChange]);

  return (
    <div className="flex-1 h-full bg-background flex items-center justify-center p-6 select-none relative overflow-hidden">
      <div className="w-full max-w-md glass-card rounded-2xl p-8 shadow-2xl relative z-10 animate-shimmer-pulse">
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 mb-1">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-100">绑定 Google 账号凭证</h2>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            无需手动填写 Gemini API Key。采用 Google 官方 Device Authorization Grant，凭证留存于本地 Rust 安全层。
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{errorMsg}</span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!deviceData ? (
            <motion.div key="start" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
              <button
                onClick={handleStartAuth}
                disabled={loading}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white font-medium text-sm transition-all shadow-lg shadow-brand-600/25 flex items-center justify-center space-x-2 active:scale-[0.99] disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在获取授权码...</span>
                  </>
                ) : (
                  <>
                    <span>绑定 Google 账号</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              <div className="flex items-center justify-center space-x-2 text-[11px] text-gray-500 pt-2">
                <Shield className="w-3.5 h-3.5" />
                <span>不经过任何第三方中转，去 Web 服务器设计</span>
              </div>
            </motion.div>
          ) : (
            <motion.div key="code" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">您的设备授权码</div>
                <div className="flex items-center justify-center space-x-3 bg-surface-hover/80 border border-surface-border p-4 rounded-xl shadow-inner">
                  <span className="font-mono text-3xl font-bold tracking-widest text-brand-500 select-all">
                    {deviceData.user_code}
                  </span>
                  <button onClick={handleCopyCode} className="p-2.5 rounded-lg bg-surface border border-surface-border hover:bg-surface-border text-gray-300 transition-colors active:scale-95">
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <button onClick={handleOpenBrowser} className="w-full py-3 px-4 rounded-xl bg-surface-hover hover:bg-surface-border text-gray-100 border border-surface-border font-medium text-sm transition-all flex items-center justify-center space-x-2 active:scale-[0.99]">
                  <span>打卡浏览器完成授权</span>
                  <ExternalLink className="w-4 h-4" />
                </button>
                <div className="flex items-center justify-center space-x-2.5 py-2 text-xs text-gray-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                  <span>正在等待 Google 账号授权认证...</span>
                </div>
              </div>

              <div className="text-center pt-2">
                <button onClick={() => { setDeviceData(null); setIsPolling(false); onAuthStateChange?.(false); }} className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-4">
                  取消并重新获取
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
