use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

/// 流式推送负载数据结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeminiStreamPayload {
    pub task_id: String,
    pub chunk: String,
    pub is_done: bool,
    pub is_error: bool,
}

/// 用户自定义 Google OAuth 客户端凭证结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ClientCredentials {
    pub client_id: String,
    pub client_secret: String,
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

// 默认 Google Cloud Client 配置
const DEFAULT_CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET: &str = "YOUR_GOOGLE_CLIENT_SECRET";

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPE: &str = "https://www.googleapis.com/auth/generative-language https://www.googleapis.com/auth/cloud-platform";
const CUSTOM_PROTOCOL_REDIRECT_URI: &str = "celatura://auth";

/// 身份凭证存储结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AuthToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub created_at: u64,
}

/// 谷歌 API Raw 响应结构体
#[derive(Debug, Deserialize)]
struct RawGoogleTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_type: Option<String>,
    scope: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// 全局内存状态管理
pub struct AppState {
    pub token: Mutex<Option<AuthToken>>,
}

/// 辅助函数：获取身份凭证配置文件路径
fn get_auth_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("获取应用配置目录失败: {}", e))?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }

    Ok(config_dir.join("auth_token.json"))
}

/// 辅助函数：获取用户 OAuth 客户端配置路径
fn get_credentials_file_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("获取应用配置目录失败: {}", e))?;

    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| format!("创建配置目录失败: {}", e))?;
    }

    Ok(config_dir.join("client_credentials.json"))
}

/// 内部辅助：保存 Token 凭证至文件与全局 State
fn save_token_internal(
    app_handle: &AppHandle,
    state: &State<'_, AppState>,
    token: AuthToken,
) -> Result<(), String> {
    let mut store = state.token.lock().map_err(|_| "内存锁损坏".to_string())?;
    *store = Some(token.clone());

    let file_path = get_auth_file_path(app_handle)?;
    let json_data = serde_json::to_string_pretty(&token)
        .map_err(|e| format!("序列化凭证失败: {}", e))?;

    fs::write(file_path, json_data).map_err(|e| format!("保存凭证文件失败: {}", e))?;

    Ok(())
}

fn url_encode(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
}

/// 操作系统 Deep Link (celatura://) 唤起事件处理的核心大动脉
fn handle_deep_link_url(app_handle: &AppHandle, url_str: &str) {
    if let Ok(parsed_url) = url::Url::parse(url_str) {
        if parsed_url.scheme() == "celatura" {
            if let Some((_, code)) = parsed_url.query_pairs().find(|(k, _)| k == "code") {
                let code = code.to_string();
                let app_handle_clone = app_handle.clone();

                // 唤醒并聚焦操作系统窗口
                if let Some(main_win) = app_handle.get_webview_window("main") {
                    let _ = main_win.unminimize();
                    let _ = main_win.set_focus();
                }

                // 在后台异步换取 Token
                tauri::async_runtime::spawn(async move {
                    let saved_creds = commands::load_client_credentials(app_handle_clone.clone()).unwrap_or(None);
                    let cid = saved_creds.as_ref().map(|c| c.client_id.clone()).unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string());
                    let csecret = saved_creds.as_ref().map(|c| c.client_secret.clone()).unwrap_or_else(|| DEFAULT_CLIENT_SECRET.to_string());

                    let client = reqwest::Client::new();
                    let params = [
                        ("client_id", cid.as_str()),
                        ("client_secret", csecret.as_str()),
                        ("code", code.as_str()),
                        ("grant_type", "authorization_code"),
                        ("redirect_uri", CUSTOM_PROTOCOL_REDIRECT_URI),
                    ];

                    if let Ok(res) = client.post(GOOGLE_TOKEN_URL).form(&params).send().await {
                        if let Ok(raw_resp) = res.json::<RawGoogleTokenResponse>().await {
                            if let Some(access_token) = raw_resp.access_token {
                                let now_sec = std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0);

                                let auth_token = AuthToken {
                                    access_token,
                                    refresh_token: raw_resp.refresh_token,
                                    expires_in: raw_resp.expires_in,
                                    token_type: raw_resp.token_type,
                                    scope: raw_resp.scope,
                                    created_at: now_sec,
                                };

                                if let Some(state_app) = app_handle_clone.try_state::<AppState>() {
                                    let _ = save_token_internal(&app_handle_clone, &state_app, auth_token.clone());
                                }

                                let _ = app_handle_clone.emit("oauth-success", auth_token);
                            }
                        }
                    }
                });
            }
        }
    }
}

// ============================================================================
// Tauri Commands 模块定义
// ============================================================================
pub mod commands {
    use super::*;

    /// Command 1: 保存用户自定义 Google Client ID 与 Client Secret
    #[tauri::command]
    pub fn save_client_credentials(
        client_id: String,
        client_secret: String,
        app_handle: AppHandle,
    ) -> Result<(), String> {
        let creds = ClientCredentials {
            client_id: client_id.trim().to_string(),
            client_secret: client_secret.trim().to_string(),
        };
        let file_path = get_credentials_file_path(&app_handle)?;
        let json_data = serde_json::to_string_pretty(&creds)
            .map_err(|e| format!("序列化 OAuth 客户端配置失败: {}", e))?;

        fs::write(file_path, json_data).map_err(|e| format!("保存 OAuth 客户端配置文件失败: {}", e))?;
        Ok(())
    }

    /// Command 2: 读取用户自定义的 Google OAuth 客户端配置
    #[tauri::command]
    pub fn load_client_credentials(
        app_handle: AppHandle,
    ) -> Result<Option<ClientCredentials>, String> {
        let file_path = get_credentials_file_path(&app_handle)?;
        if file_path.exists() {
            let content = fs::read_to_string(&file_path)
                .map_err(|e| format!("读取 OAuth 客户端配置文件失败: {}", e))?;

            let creds: ClientCredentials = serde_json::from_str(&content)
                .map_err(|e| format!("解析 OAuth 客户端配置文件失败: {}", e))?;

            return Ok(Some(creds));
        }
        Ok(None)
    }

    /// Command 3: 纯操作系统级 Deep Link (celatura://) 唤起式 OAuth2
    #[tauri::command]
    pub async fn start_google_oauth_deeplink(
        client_id: Option<String>,
        app_handle: AppHandle,
    ) -> Result<String, String> {
        let saved_creds = load_client_credentials(app_handle.clone()).unwrap_or(None);

        let cid = client_id
            .filter(|s| !s.trim().is_empty())
            .or_else(|| saved_creds.as_ref().map(|c| c.client_id.clone()))
            .ok_or_else(|| "未检测到有效的 Google Client ID，请先在界面配置！".to_string())?;

        // 拼接指向上层系统自定义协议的 Redirect URI
        let auth_url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            GOOGLE_AUTH_URL,
            url_encode(&cid),
            url_encode(CUSTOM_PROTOCOL_REDIRECT_URI),
            url_encode(DEFAULT_SCOPE)
        );

        // 唤起系统默认浏览器
        let _ = tauri_plugin_opener::open_url(&auth_url, None::<&str>);

        Ok(auth_url)
    }

    /// Command 4: 手动保存 AuthToken
    #[tauri::command]
    pub fn save_token(
        token: AuthToken,
        app_handle: AppHandle,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        save_token_internal(&app_handle, &state, token)
    }

    /// Command 5: 读取持久化的 AuthToken
    #[tauri::command]
    pub fn load_token(
        app_handle: AppHandle,
        state: State<'_, AppState>,
    ) -> Result<Option<AuthToken>, String> {
        if let Ok(store) = state.token.lock() {
            if let Some(ref token) = *store {
                return Ok(Some(token.clone()));
            }
        }

        let file_path = get_auth_file_path(&app_handle)?;
        if file_path.exists() {
            let content = fs::read_to_string(&file_path)
                .map_err(|e| format!("读取凭证文件失败: {}", e))?;

            let token: AuthToken = serde_json::from_str(&content)
                .map_err(|e| format!("解析凭证文件失败: {}", e))?;

            if let Ok(mut store) = state.token.lock() {
                *store = Some(token.clone());
            }

            return Ok(Some(token));
        }

        Ok(None)
    }

    /// Command 6: 清除已保存的 AuthToken
    #[tauri::command]
    pub fn clear_token(
        app_handle: AppHandle,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        if let Ok(mut store) = state.token.lock() {
            *store = None;
        }

        let file_path = get_auth_file_path(&app_handle)?;
        if file_path.exists() {
            let _ = fs::remove_file(file_path);
        }

        Ok(())
    }

    /// Command 7: 异步拉起全局 Gemini CLI 任务并实时推送到前端
    #[tauri::command]
    pub async fn execute_gemini_task(
        window: tauri::Window,
        prompt: String,
        current_workspace: Option<String>,
        task_id: Option<String>,
    ) -> Result<(), String> {
        let tid = task_id.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis().to_string())
                .unwrap_or_else(|_| "task_0".to_string())
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
                        chunk: format!("无法拉起系统 gemini 命令，请检查 CLI 是否已加入 PATH: {}\n", e),
                        is_done: true,
                        is_error: true,
                    },
                );
                return Err(format!("拉起 Gemini 失败: {}", e));
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
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv {
                if arg.starts_with("celatura://") {
                    handle_deep_link_url(app, &arg);
                }
            }
        }))
        .manage(AppState {
            token: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_client_credentials,
            commands::load_client_credentials,
            commands::start_google_oauth_deeplink,
            commands::save_token,
            commands::load_token,
            commands::clear_token,
            commands::execute_gemini_task
        ])
        .run(tauri::generate_context!())
        .expect("启动 Celatura 桌面端进程发生严重错误");
}
