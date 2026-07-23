use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
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

/// 本地工作区感知 (Workspace Awareness) 自动预扫描提取函数
fn build_workspace_context(workspace_path: &str) -> Option<String> {
    let path = Path::new(workspace_path);
    if !path.exists() || !path.is_dir() {
        return None;
    }

    let mut context = String::new();
    context.push_str(&format!("[Celatura 本地工作区上下文注入]\n工作区根目录: {}\n\n顶级目录与关键文件清单:\n", workspace_path));

    if let Ok(entries) = fs::read_dir(path) {
        let mut count = 0;
        for entry in entries.flatten() {
            if count >= 30 {
                context.push_str("- ... (其它文件已忽略)\n");
                break;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            // 忽略常见大中型临时与构建目录
            if file_name == "node_modules"
                || file_name == ".git"
                || file_name == "target"
                || file_name == ".next"
                || file_name == "out"
                || file_name == "dist"
                || file_name == "build"
            {
                continue;
            }

            let file_type = if entry.path().is_dir() { "[Dir]" } else { "[File]" };
            context.push_str(&format!("- {} {}\n", file_type, file_name));
            count += 1;
        }
    }

    // 自动扫描读取项目核心配置文件 Manifest
    let pkg_json_path = path.join("package.json");
    if pkg_json_path.exists() {
        if let Ok(content) = fs::read_to_string(pkg_json_path) {
            let snippet: String = content.lines().take(40).collect::<Vec<&str>>().join("\n");
            context.push_str(&format!("\n[Key Manifest: package.json (前40行)]\n```json\n{}\n```\n", snippet));
        }
    }

    let cargo_toml_path = path.join("Cargo.toml");
    if cargo_toml_path.exists() {
        if let Ok(content) = fs::read_to_string(cargo_toml_path) {
            let snippet: String = content.lines().take(40).collect::<Vec<&str>>().join("\n");
            context.push_str(&format!("\n[Key Manifest: Cargo.toml (前40行)]\n```toml\n{}\n```\n", snippet));
        }
    }

    Some(context)
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
            serde_json::from_str::<ModelConfig>(&content).unwrap_or_default()
        } else {
            ModelConfig::default()
        };

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
    pub fn save_model_config(config: ModelConfig, app_handle: AppHandle) -> Result<(), String> {
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

    /// Command 4: 多模型中转路由与 SSE 异步流式通信核心控制命令
    #[tauri::command]
    pub async fn execute_llm_task(
        window: tauri::Window,
        app_handle: AppHandle,
        prompt: String,
        current_workspace: Option<String>,
        task_id: Option<String>,
        model: Option<String>,
        provider: Option<String>,
        api_key: Option<String>,
    ) -> Result<(), String> {
        let tid = task_id.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis().to_string())
                .unwrap_or_else(|_| "task_0".to_string())
        });

        let saved_config = load_model_config(app_handle.clone()).unwrap_or_default();
        let target_model = model.unwrap_or(saved_config.active_model.clone());

        // 拼接工作区上下文与 System Prompt
        let mut full_prompt = prompt.clone();
        if let Some(ref ws) = current_workspace {
            if let Some(ws_ctx) = build_workspace_context(ws) {
                full_prompt = format!("{}\n\n[用户当前任务指令]:\n{}", ws_ctx, prompt);
            }
        }

        // 推导选定的 Model Provider
        let selected_provider = provider.unwrap_or_else(|| {
            if target_model.contains("DeepSeek") {
                "deepseek".to_string()
            } else if target_model.contains("OpenAI") || target_model.contains("Custom") {
                "openai".to_string()
            } else {
                "gemini".to_string()
            }
        });

        // 优先使用传入的 API Key，或自动读取对应 Provider 配置与系统环境变量
        let resolved_api_key = api_key.filter(|k| !k.trim().is_empty()).or_else(|| {
            match selected_provider.as_str() {
                "deepseek" => {
                    if !saved_config.deepseek_api_key.trim().is_empty() {
                        Some(saved_config.deepseek_api_key.clone())
                    } else {
                        std::env::var("DEEPSEEK_API_KEY").ok()
                    }
                }
                "openai" => {
                    if !saved_config.custom_openai_api_key.trim().is_empty() {
                        Some(saved_config.custom_openai_api_key.clone())
                    } else {
                        std::env::var("OPENAI_API_KEY").ok()
                    }
                }
                _ => {
                    if !saved_config.gemini_api_key.trim().is_empty() {
                        Some(saved_config.gemini_api_key.clone())
                    } else {
                        std::env::var("GEMINI_API_KEY").ok()
                    }
                }
            }
        });

        // 如果用户有直接配置的 API Key，走对应 Provider 的 HTTP SSE 流式接口
        if let Some(ref key) = resolved_api_key {
            let client = reqwest::Client::new();

            if selected_provider == "deepseek" || selected_provider == "openai" {
                let endpoint = if selected_provider == "deepseek" {
                    "https://api.deepseek.com/v1/chat/completions".to_string()
                } else if !saved_config.custom_openai_endpoint.trim().is_empty() {
                    let mut ep = saved_config.custom_openai_endpoint.trim().to_string();
                    if !ep.ends_with("/chat/completions") {
                        if ep.ends_with('/') {
                            ep.push_str("chat/completions");
                        } else {
                            ep.push_str("/chat/completions");
                        }
                    }
                    ep
                } else {
                    "https://api.openai.com/v1/chat/completions".to_string()
                };

                let body = serde_json::json!({
                    "model": if selected_provider == "deepseek" { "deepseek-chat" } else { "gpt-4o" },
                    "messages": [
                        {"role": "system", "content": "You are Celatura AI, an expert software developer and architect assistant."},
                        {"role": "user", "content": full_prompt}
                    ],
                    "stream": true
                });

                let res = client
                    .post(&endpoint)
                    .header("Authorization", format!("Bearer {}", key))
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await;

                match res {
                    Ok(resp) if resp.status().is_success() => {
                        let mut stream = resp.bytes_stream();
                        let mut buffer = String::new();

                        while let Some(chunk_result) = stream.next().await {
                            if let Ok(bytes) = chunk_result {
                                let text = String::from_utf8_lossy(&bytes);
                                buffer.push_str(&text);

                                while let Some(line_end) = buffer.find('\n') {
                                    let line = buffer[..line_end].trim().to_string();
                                    buffer = buffer[line_end + 1..].to_string();

                                    if let Some(data_str) = line.strip_prefix("data: ") {
                                        let data_str = data_str.trim();
                                        if data_str == "[DONE]" {
                                            break;
                                        }
                                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data_str) {
                                            if let Some(token) = v["choices"][0]["delta"]["content"].as_str() {
                                                let _ = window.emit(
                                                    "gemini-stream",
                                                    GeminiStreamPayload {
                                                        task_id: tid.clone(),
                                                        chunk: token.to_string(),
                                                        is_done: false,
                                                        is_error: false,
                                                    },
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let _ = window.emit(
                            "gemini-stream",
                            GeminiStreamPayload {
                                task_id: tid,
                                chunk: "".to_string(),
                                is_done: true,
                                is_error: false,
                            },
                        );
                        return Ok(());
                    }
                    Err(e) => {
                        println!("HTTP SSE 请求发生错误: {}", e);
                    }
                    _ => {}
                }
            } else if selected_provider == "gemini" {
                let model_name = if target_model.contains("Flash") { "gemini-1.5-flash" } else { "gemini-1.5-pro" };
                let url = format!(
                    "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
                    model_name, key
                );

                let body = serde_json::json!({
                    "contents": [
                        {
                            "role": "user",
                            "parts": [{"text": full_prompt}]
                        }
                    ]
                });

                let res = client
                    .post(&url)
                    .header("Content-Type", "application/json")
                    .json(&body)
                    .send()
                    .await;

                match res {
                    Ok(resp) if resp.status().is_success() => {
                        let mut stream = resp.bytes_stream();
                        let mut buffer = String::new();

                        while let Some(chunk_result) = stream.next().await {
                            if let Ok(bytes) = chunk_result {
                                let text = String::from_utf8_lossy(&bytes);
                                buffer.push_str(&text);

                                while let Some(line_end) = buffer.find('\n') {
                                    let line = buffer[..line_end].trim().to_string();
                                    buffer = buffer[line_end + 1..].to_string();

                                    if let Some(data_str) = line.strip_prefix("data: ") {
                                        let data_str = data_str.trim();
                                        if let Ok(v) = serde_json::from_str::<serde_json::Value>(data_str) {
                                            if let Some(token) = v["candidates"][0]["content"]["parts"][0]["text"].as_str() {
                                                let _ = window.emit(
                                                    "gemini-stream",
                                                    GeminiStreamPayload {
                                                        task_id: tid.clone(),
                                                        chunk: token.to_string(),
                                                        is_done: false,
                                                        is_error: false,
                                                    },
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        let _ = window.emit(
                            "gemini-stream",
                            GeminiStreamPayload {
                                task_id: tid,
                                chunk: "".to_string(),
                                is_done: true,
                                is_error: false,
                            },
                        );
                        return Ok(());
                    }
                    Err(e) => {
                        println!("Gemini SSE 请求发生错误: {}", e);
                    }
                    _ => {}
                }
            }
        }

        // 回退逻辑：启动系统 gemini CLI
        #[cfg(target_os = "windows")]
        let mut cmd = tokio::process::Command::new("cmd");
        #[cfg(target_os = "windows")]
        cmd.args(["/C", "gemini", &full_prompt]);

        #[cfg(not(target_os = "windows"))]
        let mut cmd = tokio::process::Command::new("gemini");
        #[cfg(not(target_os = "windows"))]
        cmd.arg(&full_prompt);

        for (k, v) in std::env::vars() {
            cmd.env(k, v);
        }

        if let Some(ref key) = resolved_api_key {
            cmd.env("GEMINI_API_KEY", key);
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
                        chunk: format!("无法拉起大模型 API 或 CLI 进程，请检查 API Key 配置或系统 PATH: {}\n", e),
                        is_done: true,
                        is_error: true,
                    },
                );
                return Err(format!("拉起进程失败: {}", e));
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

    /// Command 5: 兼容原有前端调用的 execute_gemini_task 命令
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
        execute_llm_task(
            window,
            app_handle,
            prompt,
            current_workspace,
            task_id,
            model,
            None,
            api_key,
        )
        .await
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
            commands::execute_llm_task,
            commands::execute_gemini_task
        ])
        .run(tauri::generate_context!())
        .expect("启动 Celatura 桌面端进程发生严重错误");
}
