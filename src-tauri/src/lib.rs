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

// 默认 Google Cloud Client 配置
const DEFAULT_CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET: &str = "YOUR_GOOGLE_CLIENT_SECRET";

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPE: &str = "https://www.googleapis.com/auth/generative-language https://www.googleapis.com/auth/cloud-platform";

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

/// 内部辅助：保存凭证至文件与全局 State
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

// ============================================================================
// Tauri Commands 模块定义
// ============================================================================
pub mod commands {
    use super::*;

    /// Command 1: 本地 OAuth2 回调 HTTP 服务与浏览器唤起
    #[tauri::command]
    pub async fn start_google_oauth(
        window: tauri::Window,
        client_id: Option<String>,
        client_secret: Option<String>,
        app_handle: AppHandle,
        _state: State<'_, AppState>,
    ) -> Result<String, String> {
        let cid = client_id.unwrap_or_else(|| DEFAULT_CLIENT_ID.to_string());
        let csecret = client_secret.unwrap_or_else(|| DEFAULT_CLIENT_SECRET.to_string());

        // 1. 启动本地 127.0.0.1 随机端口 HTTP 服务器
        let server = tiny_http::Server::http("127.0.0.1:0")
            .map_err(|e| format!("无法启动本地回调 HTTP 服务: {}", e))?;

        let port = server.server_addr().to_ip().map(|addr| addr.port()).unwrap_or(0);
        if port == 0 {
            return Err("分配本地随机端口失败".to_string());
        }

        let redirect_uri = format!("http://127.0.0.1:{}", port);

        // 2. 构造标准网页 OAuth 授权 URL
        let auth_url = format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent",
            GOOGLE_AUTH_URL,
            url_encode(&cid),
            url_encode(&redirect_uri),
            url_encode(DEFAULT_SCOPE)
        );

        // 3. 唤起默认系统浏览器
        let _ = tauri_plugin_opener::open_url(&auth_url, None::<&str>);

        let app_handle_clone = app_handle.clone();
        let redirect_uri_cb = redirect_uri.clone();

        // 4. 后台线程监听重定向回调
        tokio::task::spawn_blocking(move || {
            if let Ok(Some(request)) = server.recv_timeout(std::time::Duration::from_secs(300)) {
                let req_url = format!("http://localhost{}", request.url());
                if let Ok(parsed_url) = url::Url::parse(&req_url) {
                    let code_opt = parsed_url
                        .query_pairs()
                        .find(|(k, _)| k == "code")
                        .map(|(_, v)| v.to_string());

                    if let Some(code) = code_opt {
                        let html = r#"<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Celatura - 授权成功</title>
    <style>
        body { background-color: #0d0e11; color: #f3f4f6; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: rgba(17, 19, 26, 0.9); border: 1px solid rgba(59, 130, 246, 0.3); padding: 40px; border-radius: 20px; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        h1 { color: #60a5fa; margin-bottom: 12px; font-size: 24px; }
        p { color: #9ca3af; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Google 账号授权成功</h1>
        <p>凭证已安全建立，您可以关闭此浏览器标签页并返回 Celatura 桌面客户端。</p>
    </div>
</body>
</html>"#;
                        let response = tiny_http::Response::from_string(html)
                            .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                        let _ = request.respond(response);

                        // 异步换取 Token
                        let runtime = tokio::runtime::Builder::new_current_thread()
                            .enable_all()
                            .build();

                        if let Ok(rt) = runtime {
                            rt.block_on(async {
                                let client = reqwest::Client::new();
                                let params = [
                                    ("client_id", cid.as_str()),
                                    ("client_secret", csecret.as_str()),
                                    ("code", code.as_str()),
                                    ("grant_type", "authorization_code"),
                                    ("redirect_uri", redirect_uri_cb.as_str()),
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

                                            // 写入 AppState 和磁盘持久化
                                            if let Some(state_app) = app_handle_clone.try_state::<AppState>() {
                                                let _ = save_token_internal(&app_handle_clone, &state_app, auth_token.clone());
                                            }

                                            let _ = window.emit("oauth-success", auth_token);
                                        }
                                    }
                                }
                            });
                        }
                    } else {
                        let response = tiny_http::Response::from_string("授权失败: 未包含 code 参数");
                        let _ = request.respond(response);
                    }
                }
            }
        });

        Ok(redirect_uri)
    }

    /// Command 2: 手动保存 Token
    #[tauri::command]
    pub fn save_token(
        token: AuthToken,
        app_handle: AppHandle,
        state: State<'_, AppState>,
    ) -> Result<(), String> {
        save_token_internal(&app_handle, &state, token)
    }

    /// Command 3: 读取持久化的 AuthToken
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

    /// Command 4: 清除已保存的 AuthToken
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

    /// Command 5: 异步拉起全局 Gemini CLI 任务并实时推送到前端
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
        .manage(AppState {
            token: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::start_google_oauth,
            commands::save_token,
            commands::load_token,
            commands::clear_token,
            commands::execute_gemini_task
        ])
        .run(tauri::generate_context!())
        .expect("启动 Celatura 桌面端进程发生严重错误");
}
