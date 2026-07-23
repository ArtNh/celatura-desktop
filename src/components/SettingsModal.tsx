'use client';

import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  X,
  KeyRound,
  Check,
  Save,
  Sparkles,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  Zap,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ModelConfig {
  gemini_api_key: string;
  deepseek_api_key: string;
  custom_openai_api_key: string;
  custom_openai_endpoint: string;
  active_model: string;
}

export interface ApiKeyStatus {
  gemini_ready: boolean;
  gemini_env_detected: boolean;
  deepseek_ready: boolean;
  custom_ready: boolean;
  has_any_ready: boolean;
  active_model: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved,
}) => {
  const [config, setConfig] = useState<ModelConfig>({
    gemini_api_key: '',
    deepseek_api_key: '',
    custom_openai_api_key: '',
    custom_openai_endpoint: '',
    active_model: 'Gemini 1.5 Pro',
  });

  const [status, setStatus] = useState<ApiKeyStatus | null>(null);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showDeepseekKey, setShowDeepseekKey] = useState<boolean>(false);
  const [showCustomKey, setShowCustomKey] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadConfigAndStatus();
    }
  }, [isOpen]);

  const loadConfigAndStatus = async () => {
    try {
      const cfg = await invoke<ModelConfig>('load_model_config');
      const st = await invoke<ApiKeyStatus>('check_api_key_status');
      if (cfg) setConfig(cfg);
      if (st) setStatus(st);
    } catch (err) {
      console.warn('获取模型凭证配置失败:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    try {
      await invoke('save_model_config', { config });
      setSavedSuccess(true);
      await loadConfigAndStatus();
      onConfigSaved?.();
      setTimeout(() => {
        setSavedSuccess(false);
      }, 2000);
    } catch (err: any) {
      setErrorMsg(typeof err === 'string' ? err : '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="w-full max-w-xl bg-[#0f111a] border border-surface-border/90 rounded-2xl p-6 shadow-2xl space-y-6 relative overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-border/60 pb-4">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
                <Cpu className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-100">多模型凭证与引擎设置</h2>
                <p className="text-xs text-gray-400">设置 API Key 凭证，解锁模型无感调用与智能体工作流</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 状态检测卡片 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-surface/60 border border-surface-border/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-300">Gemini</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    status?.gemini_ready ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-gray-600'
                  }`}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-2 truncate">
                {status?.gemini_env_detected
                  ? '已检测系统 GEMINI_API_KEY'
                  : status?.gemini_ready
                  ? '已设置 API Key'
                  : '未配置凭证'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface/60 border border-surface-border/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-300">DeepSeek</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    status?.deepseek_ready ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-gray-600'
                  }`}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-2 truncate">
                {status?.deepseek_ready ? '已设置 API Key' : '未配置凭证'}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-surface/60 border border-surface-border/60 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-gray-300">Custom OpenAI</span>
                <span
                  className={`w-2 h-2 rounded-full ${
                    status?.custom_ready ? 'bg-emerald-400 shadow-lg shadow-emerald-400/50' : 'bg-gray-600'
                  }`}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-2 truncate">
                {status?.custom_ready ? '兼容服务已就绪' : '未配置凭证'}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 表单卡片区 */}
          <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
            {/* Gemini API Key */}
            <div className="space-y-1.5 p-3.5 rounded-xl bg-surface/40 border border-surface-border/50">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-200 flex items-center space-x-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-brand-400" />
                  <span>Google Gemini API Key</span>
                </label>
                {status?.gemini_env_detected && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                    系统 GEMINI_API_KEY 自动亮起
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={config.gemini_api_key}
                  onChange={(e) => setConfig({ ...config, gemini_api_key: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full bg-[#090a0f] border border-surface-border focus:border-brand-500/60 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showGeminiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* DeepSeek API Key */}
            <div className="space-y-1.5 p-3.5 rounded-xl bg-surface/40 border border-surface-border/50">
              <label className="text-xs font-medium text-gray-200 flex items-center space-x-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                <span>DeepSeek API Key</span>
              </label>
              <div className="relative">
                <input
                  type={showDeepseekKey ? 'text' : 'password'}
                  value={config.deepseek_api_key}
                  onChange={(e) => setConfig({ ...config, deepseek_api_key: e.target.value })}
                  placeholder="sk-..."
                  className="w-full bg-[#090a0f] border border-surface-border focus:border-brand-500/60 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowDeepseekKey(!showDeepseekKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showDeepseekKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Custom OpenAI-compatible Provider */}
            <div className="space-y-3 p-3.5 rounded-xl bg-surface/40 border border-surface-border/50">
              <label className="text-xs font-medium text-gray-200 flex items-center space-x-1.5">
                <Globe className="w-3.5 h-3.5 text-purple-400" />
                <span>Custom OpenAI Compatible Provider</span>
              </label>
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type={showCustomKey ? 'text' : 'password'}
                    value={config.custom_openai_api_key}
                    onChange={(e) => setConfig({ ...config, custom_openai_api_key: e.target.value })}
                    placeholder="API Key (e.g. sk-xxxx)"
                    className="w-full bg-[#090a0f] border border-surface-border focus:border-brand-500/60 rounded-lg pl-3 pr-9 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCustomKey(!showCustomKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  >
                    {showCustomKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <input
                  type="text"
                  value={config.custom_openai_endpoint}
                  onChange={(e) => setConfig({ ...config, custom_openai_endpoint: e.target.value })}
                  placeholder="Base URL / Endpoint (e.g. https://api.openai.com/v1)"
                  className="w-full bg-[#090a0f] border border-surface-border focus:border-brand-500/60 rounded-lg px-3 py-2 text-xs font-mono text-gray-100 placeholder-gray-600 outline-none transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className="flex items-center justify-end space-x-3 border-t border-surface-border/60 pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-gray-400 hover:text-gray-200 hover:bg-surface transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-medium text-xs shadow-lg shadow-brand-600/20 active:scale-95 transition-all disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : savedSuccess ? (
                <Check className="w-4 h-4 text-emerald-300" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{savedSuccess ? '凭证配置已成功保存' : '保存模型配置'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
