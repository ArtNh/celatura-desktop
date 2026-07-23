use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};

/// 流式推送负载数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiStreamPayload {
    pub task_id: String,
    pub chunk: String,
    pub is_done: bool,
    pub is_error: bool,
}

/// 多模型 API Key 凭证配置结构体
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ModelConfig {
    pub gemini_api_key: String,
    pub deepseek_api_key: String,
    pub custom_openai_api_key: String,
    pub custom_openai_endpoint: String,
    pub active_model: String,
}

/// 模型凭证状态检测结果结构体
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ApiKeyStatus {
    pub gemini_ready: bool,
    pub gemini_env_detected: bool,
    pub deepseek_ready: bool,
    pub custom_ready: bool,
    pub has_any_ready: bool,
    pub active_model: String,
}

/// 高效过滤 ANSI 终端颜色转义字符
fn strip_ansi_codes(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1B' {
            if let Some(&'[') = chars.peek() {
                chars.next();
                while let Some(&nc) = chars.peek() {
                    chars.next();
                    if nc.is_ascii_alphabetic() || nc == 'm' || nc == 'K' || nc == 'H' || nc == 'J' {
                        break;
                    }
                }
            }
            continue;
        }
        result.push(c);
    }
    result
}

/// 获取模型凭证配置文件路径
fn get_model_config_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("获取应用配置目录失败: {}", e))?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }

    Ok(config_dir.join("model_config.json"))
}

// ============================================================================
// Tauri Commands 模块定义
// ============================================================================
pub mod commands {
    use super::*;

    /// Command 1: 读取多模型 API 凭证配置
    #[tauri::command]
    pub fn load_model_config(app_handle: AppHandle) -> Result<ModelConfig, String> {
        let file_path = get_model_config_file_path(&app_handle)?;
        let mut config = if file_path.exists() {
            let content = fs::read_to_string(&file_path)
                .map_err(|e| format!("读取配置文件失败: {}", e))?;
            serde_json::from_str::<ModelConfig>(&content)
                .unwrap_or_default()
        } else {
            ModelConfig::default()
        };

        // 如果用户尚未在配置中手动设置 Gemini API Key，自动尝试回退读取系统环境变量 GEMINI_API_KEY
        if config.gemini_api_key.trim().is_empty() {
            if let Ok(env_key) = std::env::var("GEMINI_API_KEY") {
                if !env_key.trim().is_empty() {
                    config.gemini_api_key = env_key.trim().to_string();
                }
            }
        }

        if config.active_model.trim().is_empty() {
            config.active_model = "Gemini 1.5 Pro".to_string();
        }

        Ok(config)
    }

    /// Command 2: 保存多模型 API 凭证配置
    #[tauri::command]
    pub fn save_model_config(
        config: ModelConfig,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let file_path = get_model_config_file_path(&app_handle)?;
        let json_data = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("序列化模型配置失败: {}", e))?;

        fs::write(file_path, json_data).map_err(|e| format!("保存模型配置文件失败: {}", e))?;
        Ok(())
    }

    /// Command 3: 检查模型凭证与系统环境变量点亮状态
    #[tauri::command]
    pub fn check_api_key_status(app_handle: AppHandle) -> Result<ApiKeyStatus, String> {
        let config = load_model_config(app_handle)?;
        let env_gemini_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
        let gemini_env_detected = !env_gemini_key.trim().is_empty();

        let gemini_ready = !config.gemini_api_key.trim().is_empty() || gemini_env_detected;
        let deepseek_ready = !config.deepseek_api_key.trim().is_empty();
        let custom_ready = !config.custom_openai_api_key.trim().is_empty();
        let has_any_ready = gemini_ready || deepseek_ready || custom_ready;

        Ok(ApiKeyStatus {
            gemini_ready,
            gemini_env_detected,
            deepseek_ready,
            custom_ready,
            has_any_ready,
            active_model: config.active_model,
        })
    }

    /// Command 4: 异步拉起大模型 CLI/服务任务并实时推送到前端
    #[tauri::command]
    pub async fn execute_gemini_task(
        window: tauri::Window,
        app_handle: AppHandle,
        prompt: String,
        current_workspace: Option<String>,
        task_id: Option<String>,
        model: Option<String>,
        api_key: Option<String>,
    ) -> Result<(), String> {
        let tid = task_id.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis().to_string())
                .unwrap_or_else(|_| "task_0".to_string())
        });

        // 获取模型凭证
        let saved_config = load_model_config(app_handle.clone()).unwrap_or_default();
        
        let resolved_api_key = api_key
            .filter(|k| !k.trim().is_empty())
            .or_else(|| {
                if !saved_config.gemini_api_key.trim().is_empty() {
                    Some(saved_config.gemini_api_key.clone())
                } else {
                    std::env::var("GEMINI_API_KEY").ok()
                }
            });

        #[cfg(target_os = "windows")]
        let mut cmd = tokio::process::Command::new("cmd");
        #[cfg(target_os = "windows")]
        cmd.args(["/C", "gemini", &prompt]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = tokio::process::Command::new("gemini");
        #[cfg(not(target_os = "windows"))]
        cmd.arg(&prompt);

        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }

        // 如果获取到有效的 API Key，将其注入进程环境变量
        if let Some(ref key) = resolved_api_key {
            cmd.env("GEMINI_API_KEY", key);
        }
        if !saved_config.deepseek_api_key.trim().is_empty() {
            cmd.env("DEEPSEEK_API_KEY", &saved_config.deepseek_api_key);
        }
        if !saved_config.custom_openai_api_key.trim().is_empty() {
            cmd.env("OPENAI_API_KEY", &saved_config.custom_openai_api_key);
        }
        if !saved_config.custom_openai_endpoint.trim().is_empty() {
            cmd.env("OPENAI_BASE_URL", &saved_config.custom_openai_endpoint);
        }
        if let Some(ref m) = model {
            cmd.env("CELATURA_ACTIVE_MODEL", m);
        }

        if let Some(ref ws) = current_workspace {
            if !ws.trim().is_empty() {
                let path = PathBuf::from(ws);
                if path.exists() && path.is_dir() {
                    cmd.current_dir(path);
                }
            }
        }

        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());

        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = window.emit(
                    "gemini-stream",
                    GeminiStreamPayload {
                        task_id: tid.clone(),
                        chunk: format!("无法拉起大模型命令执行器，请检查 CLI 是否已安装并放入系统 PATH 环境变量: {}\n", e),
                        is_done: true,
                        is_error: true,
                    },
                );
                return Err(format!("拉起 CLI 进程失败: {}", e));
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        let window_stdout = window.clone();
        let tid_stdout = tid.clone();

        let stdout_handle = tokio::spawn(async move {
            if let Some(stdout) = stdout {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let cleaned_line = strip_ansi_codes(&line);
                    let _ = window_stdout.emit(
                        "gemini-stream",
                        GeminiStreamPayload {
                            task_id: tid_stdout.clone(),
                            chunk: format!("{}\n", cleaned_line),
                            is_done: false,
                            is_error: false,
                        },
                    );
                }
            }
        });

        let window_stderr = window.clone();
        let tid_stderr = tid.clone();

        let stderr_handle = tokio::spawn(async move {
            if let Some(stderr) = stderr {
                let mut reader = BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let cleaned_line = strip_ansi_codes(&line);
                    if !cleaned_line.trim().is_empty() {
                        let _ = window_stderr.emit(
                            "gemini-stream",
                            GeminiStreamPayload {
                                task_id: tid_stderr.clone(),
                                chunk: format!("{}\n", cleaned_line),
                                is_done: false,
                                is_error: true,
                            },
                        );
                    }
                }
            }
        });

        let _ = tokio::join!(stdout_handle, stderr_handle);
        let status = child.wait().await.map_err(|e| format!("进程等待发生错误: {}", e))?;

        let _ = window.emit(
            "gemini-stream",
            GeminiStreamPayload {
                task_id: tid,
                chunk: "".to_string(),
                is_done: true,
                is_error: !status.success(),
            },
        );

        Ok(())
    }
}

/// Tauri 应用入口与指令挂载
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_model_config,
            commands::save_model_config,
            commands::check_api_key_status,
            commands::execute_gemini_task
        ])
        .run(tauri::generate_context!())
        .expect("启动 Celatura 桌面端进程发生严重错误");
}
