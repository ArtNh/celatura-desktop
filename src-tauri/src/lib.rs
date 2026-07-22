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


// 默认 Google Cloud Client 配置（可通过环境或设置传入覆盖）
const DEFAULT_CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET: &str = "YOUR_GOOGLE_CLIENT_SECRET";

const GOOGLE_DEVICE_CODE_URL: &str = "https://oauth2.googleapis.com/device/code";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPE: &str = "https://www.googleapis.com/auth/generative-language https://www.googleapis.com/auth/cloud-platform";

/// 1. 谷歌设备授权码响应结构
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_url: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// 2. 身份凭证存储结构
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AuthToken {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub created_at: u64,
}

/// 3. Token 轮询响应结构（包含多态错误匹配机制）
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PollTokenResponse {
    pub status: PollStatus,
    pub token: Option<AuthToken>,
    pub error_code: Option<String>,
    pub error_description: Option<String>,
}

/// 轮询状态枚举
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PollStatus {
    Success,
    Pending,
    SlowDown,
    AccessDenied,
    ExpiredToken,
    Failed,
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

/// 辅助函数：获取本地配置文件路径
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

// ============================================================================
// Tauri Commands 实现
// ============================================================================

/// Command 1: 向谷歌设备端点请求设备授权码
#[tauri::command]
pub async fn request_device_code(
    client_id: Option<String>,
) -> Result<DeviceCodeResponse, String> {
    let client = reqwest::Client::new();
    let cid = client_id.unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string());

    let params = [
        ("client_id", cid.as_str()),
        ("scope", DEFAULT_SCOPE),
    ];

    let res = client
        .post(GOOGLE_DEVICE_CODE_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("网络请求失败，请检查代理设置: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("谷歌 OAuth 设备端点异常: {}", err_text));
    }

    let device_resp = res
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("解析设备码数据失败: {}", e))?;

    Ok(device_resp)
}

/// Command 2: 轮询谷歌 Token 端点并精准匹配错误码
#[tauri::command]
pub async fn poll_for_token(
    device_code: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<PollTokenResponse, String> {
    let client = reqwest::Client::new();
    let cid = client_id.unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string());
    let csecret = client_secret.unwrap_or_else(|| DEFAULT_CLIENT_SECRET.to_string());

    let params = [
        ("client_id", cid.as_str()),
        ("client_secret", csecret.as_str()),
        ("device_code", device_code.as_str()),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ];

    let res = client
        .post(GOOGLE_TOKEN_URL)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token 轮询网络异常: {}", e))?;

    let raw_resp = res
        .json::<RawGoogleTokenResponse>()
        .await
        .map_err(|e| format!("Token 响应解析失败: {}", e))?;

    // 1. 检查授权成功分支
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

        // 更新内存状态与文件持久化
        let _ = save_token_internal(&app_handle, &state, auth_token.clone());

        return Ok(PollTokenResponse {
            status: PollStatus::Success,
            token: Some(auth_token),
            error_code: None,
            error_description: None,
        });
    }

    // 2. 检查错误状态分支与精准错误码匹配
    if let Some(ref err_str) = raw_resp.error {
        let status = match err_str.as_str() {
            "authorization_pending" => PollStatus::Pending,
            "slow_down" => PollStatus::SlowDown,
            "access_denied" => PollStatus::AccessDenied,
            "expired_token" => PollStatus::ExpiredToken,
            _ => PollStatus::Failed,
        };

        return Ok(PollTokenResponse {
            status,
            token: None,
            error_code: Some(err_str.clone()),
            error_description: raw_resp.error_description,
        });
    }

    Ok(PollTokenResponse {
        status: PollStatus::Failed,
        token: None,
        error_code: Some("unknown_response".to_string()),
        error_description: Some("未从响应中识别出有效 Token 或标准错误".to_string()),
    })
}

/// 内部辅助：保存凭证至文件与全局 State
fn save_token_internal(
    app_handle: &AppHandle,
    state: &State<'_, AppState>,
    token: AuthToken,
) -> Result<(), String> {
    // 写入内存 State
    let mut store = state.token.lock().map_err(|_| "内存锁损坏".to_string())?;
    *store = Some(token.clone());

    // 持久化到本地配置文件
    let file_path = get_auth_file_path(app_handle)?;
    let json_data = serde_json::to_string_pretty(&token)
        .map_err(|e| format!("序列化凭证失败: {}", e))?;

    fs::write(file_path, json_data).map_err(|e| format!("保存凭证文件失败: {}", e))?;

    Ok(())
}

/// Command 3: 手动保存 Token
#[tauri::command]
pub fn save_token(
    token: AuthToken,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    save_token_internal(&app_handle, &state, token)
}

/// Command 4: 读取持久化的 AuthToken
#[tauri::command]
pub fn load_token(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<AuthToken>, String> {
    // 优先尝试从内存中获取
    if let Ok(store) = state.token.lock() {
        if let Some(ref token) = *store {
            return Ok(Some(token.clone()));
        }
    }

    // 若内存无值，从本地文件加载
    let file_path = get_auth_file_path(&app_handle)?;
    if file_path.exists() {
        let content = fs::read_to_string(&file_path)
            .map_err(|e| format!("读取凭证文件失败: {}", e))?;

        let token: AuthToken = serde_json::from_str(&content)
            .map_err(|e| format!("解析凭证文件失败: {}", e))?;

        // 重新同步回内存
        if let Ok(mut store) = state.token.lock() {
            *store = Some(token.clone());
        }

        return Ok(Some(token));
    }

    Ok(None)
}

/// Command 5: 清除已保存的 AuthToken
#[tauri::command]
pub fn clear_token(
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 重置内存
    if let Ok(mut store) = state.token.lock() {
        *store = None;
    }

    // 删除磁盘文件
    let file_path = get_auth_file_path(&app_handle)?;
    if file_path.exists() {
        let _ = fs::remove_file(file_path);
    }

    Ok(())
}

/// Command 6: 异步拉起全局 Gemini CLI 任务并实时推送到前端
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

    // 继承完整环境变量
    for (k, v) in std::env::vars() {
        cmd.env(k, v);
    }

    // 切换到用户当前工作区路径
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
                    chunk: format!("无法拉起系统 gemini 命令，请检查 CLI 是否配置全路径或已加入 PATH: {}\n", e),
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

/// Tauri 应用入口与指令挂载
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            token: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            request_device_code,
            poll_for_token,
            save_token,
            load_token,
            clear_token,
            execute_gemini_task
        ])
        .run(tauri::generate_context!())
        .expect("启动 Celatura 桌面端进程发生严重错误");
}
