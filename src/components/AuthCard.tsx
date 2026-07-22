'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { KeyRound, Copy, Check, ExternalLink, RefreshCw, Shield, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DeviceCodeData {
  device_code: String;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}

interface AuthCardProps {
  onSuccess: () => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({ onSuccess }) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [deviceData, setDeviceData] = useState<DeviceCodeData | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [polling, setPolling] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 1. 发起设备授权码请求
  const handleStartAuth = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await invoke<DeviceCodeData>('request_device_code', {
        clientId: null, // 使用 Rust 后端内置默认客户端 ID
      });
      setDeviceData(data);
      setPolling(true);
    } catch (err: any) {
      setErrorMsg(typeof err === 'string' ? err : '获取设备授权码失败，请确认网络代理配置');
    } finally {
      setLoading(false);
    }
  };

  // 2. 复制 User Code 验证码
  const handleCopyCode = () => {
    if (!deviceData) return;
    navigator.clipboard.writeText(deviceData.user_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 3. 打开系统默认浏览器进入验证页面
  const handleOpenBrowser = async () => {
    if (!deviceData) return;
    try {
      await openUrl(deviceData.verification_url);
    } catch (err) {
      // 降级方案
      window.open(deviceData.verification_url, '_blank');
    }
  };

  // 4. 后台安全轮询 Token 端点
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    if (polling && deviceData) {
      const intervalMs = Math.max(deviceData.interval || 5, 5) * 1000;

      const checkToken = async () => {
        try {
          const res: any = await invoke('poll_for_token', {
            deviceCode: deviceData.device_code,
            clientId: null,
            clientSecret: null,
          });

          if (res.access_token) {
            setPolling(false);
            onSuccess();
          } else if (res.error) {
            if (res.error === 'authorization_pending') {
              // 授权等待中，继续下一轮轮询
            } else if (res.error === 'slow_down') {
              // 减速请求
            } else {
              // 授权拒绝或过期
              setPolling(false);
              setErrorMsg(`授权流程中断: ${res.error_description || res.error}`);
            }
          }
        } catch (err: any) {
          // 容错处理
        }
      };

      timer = setInterval(checkToken, intervalMs);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [polling, deviceData, onSuccess]);

  return (
    <div className="flex-1 h-full bg-background flex items-center justify-center p-6 select-none relative overflow-hidden">
      {/* 极简背景微光装饰 */}
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-brand-accent/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md bg-surface border border-surface-border rounded-2xl p-8 shadow-2xl relative z-10"
      >
        {/* 卡片头部 */}
        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-brand-500 mb-1">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-gray-100">
            绑定谷歌账号授权
          </h2>
          <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
            免手动填写 Gemini API Key。采用 Google 官方设备授权流（OAuth Device Code Flow），全过程于本地安全进行。
          </p>
        </div>

        {/* 错误提示块 */}
        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center">
            {errorMsg}
          </div>
        )}

        {/* 主交互内容区 */}
        <AnimatePresence mode="wait">
          {!deviceData ? (
            /* 未请求授权码状态 */
            <motion.div
              key="start"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <button
                onClick={handleStartAuth}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white font-medium text-sm transition-all shadow-lg shadow-brand-600/20 flex items-center justify-center space-x-2 active:scale-[0.99] disabled:opacity-50"
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
                <span>凭证全量存留于本地 Rust 加密栈，前端不留密文</span>
              </div>
            </motion.div>
          ) : (
            /* 获得设备码状态 */
            <motion.div
              key="code"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* 大字号展示 User Code */}
              <div className="space-y-2 text-center">
                <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
                  您的设备授权码
                </div>
                <div className="flex items-center justify-center space-x-3 bg-surface-hover border border-surface-border p-4 rounded-xl">
                  <span className="font-mono text-2xl font-bold tracking-widest text-brand-500">
                    {deviceData.user_code}
                  </span>
                  <button
                    onClick={handleCopyCode}
                    className="p-2 rounded-lg bg-surface border border-surface-border hover:bg-surface-border text-gray-300 transition-colors"
                    title="复制授权码"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 唤起默认浏览器授权按钮 */}
              <div className="space-y-3">
                <button
                  onClick={handleOpenBrowser}
                  className="w-full py-3 px-4 rounded-xl bg-surface-hover hover:bg-surface-border text-gray-100 border border-surface-border font-medium text-sm transition-all flex items-center justify-center space-x-2 active:scale-[0.99]"
                >
                  <span>打开谷歌授权网页</span>
                  <ExternalLink className="w-4 h-4" />
                </button>

                {/* 后台轮询等待状态 */}
                <div className="flex items-center justify-center space-x-2 py-2 text-xs text-gray-400">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand-500" />
                  <span>等待浏览器完成登录授权...</span>
                </div>
              </div>

              {/* 重试/重置按钮 */}
              <div className="text-center pt-2">
                <button
                  onClick={() => {
                    setDeviceData(null);
                    setPolling(false);
                  }}
                  className="text-xs text-gray-500 hover:text-gray-300 underline underline-offset-4"
                >
                  重新生成授权码
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
