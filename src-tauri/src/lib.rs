use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

// 默认配置（开发者可在运行时自定义覆盖或注入环境变量）
const DEFAULT_CLIENT_ID: &str = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const DEFAULT_CLIENT_SECRET: &str = "YOUR_GOOGLE_CLIENT_SECRET";
const GOOGLE_DEVICE_CODE_URL: &str = "https://oauth2.googleapis.com/device/code";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPE: &str = "https://www.googleapis.com/auth/generative-language https://www.googleapis.com/auth/cloud-platform";

/// 谷歌设备码响应结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_url: String,
    pub expires_in: u64,
    pub interval: u64,
}

/// 谷歌 Token 授权响应结构体
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenResponse {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub expires_in: Option<u64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
}

/// 本地持久化凭证状态
#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct AuthState {
    pub is_authenticated: bool,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub user_email: Option<String>,
}

pub struct AppState {
    pub auth: Mutex<AuthState>,
}

/// Command 1: 请求谷歌设备授权码 (Device Authorization Flow)
#[tauri::command]
async fn request_device_code(
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
        .map_err(|e| format!("网络请求失败，请检查网络或代理设置: {}", e))?;

    if !res.status().is_success() {
        let err_text = res.text().await.unwrap_or_default();
        return Err(format!("谷歌 OAuth 设备端点响应异常: {}", err_text));
    }

    let device_resp = res
        .json::<DeviceCodeResponse>()
        .await
        .map_err(|e| format!("解析设备码数据失败: {}", e))?;

    Ok(device_resp)
}

/// Command 2: 轮询谷歌 Token 端点验证授权状态
#[tauri::command]
async fn poll_for_token(
    device_code: String,
    client_id: Option<String>,
    client_secret: Option<String>,
    state: State<'_, AppState>,
) -> Result<TokenResponse, String> {
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

    let token_resp = res
        .json::<TokenResponse>()
        .await
        .map_err(|e| format!("Token 响应解析失败: {}", e))?;

    // 授权成功则更新本地持久化状态
    if let Some(ref access_token) = token_resp.access_token {
        let mut store = state.auth.lock().map_err(|_| "内部状态锁受损".to_string())?;
        store.is_authenticated = true;
        store.access_token = Some(access_token.clone());
        store.refresh_token = token_resp.refresh_token.clone();
    }

    Ok(token_resp)
}

/// Command 3: 读取当前本地存储的凭证状态
#[tauri::command]
fn get_auth_state(state: State<'_, AppState>) -> Result<AuthState, String> {
    let store = state.auth.lock().map_err(|_| "内部状态锁受损".to_string())?;
    Ok(store.clone())
}

/// Command 4: 注销/退出登录清除本地凭证
#[tauri::command]
fn logout(state: State<'_, AppState>) -> Result<(), String> {
    let mut store = state.auth.lock().map_err(|_| "内部状态锁受损".to_string())?;
    store.is_authenticated = false;
    store.access_token = None;
    store.refresh_token = None;
    store.user_email = None;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(AppState {
            auth: Mutex::new(AuthState::default()),
        })
        .invoke_handler(tauri::generate_handler![
            request_device_code,
            poll_for_token,
            get_auth_state,
            logout
        ])
        .run(tauri::generate_context!())
        .expect("运行 Celatura Tauri 桌面客户端出错");
}
