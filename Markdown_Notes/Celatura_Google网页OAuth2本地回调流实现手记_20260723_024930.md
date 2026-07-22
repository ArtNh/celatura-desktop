# Celatura Google 网页 OAuth2 本地回调流架构实现手记

> 本文档记录 Celatura Desktop 放弃原有设备授权码模式（Device Flow），重构为类似 VS Code 体验的本地网页 OAuth2 回调流（Local Loopback Server OAuth Flow）的全过程。

---

## 重构目标与核心设计

### 1. 原体验痛点
- **设备授权流（Device Flow）**：需要用户手动复制代码，并在网页中多次粘贴确认，步骤较为繁琐。

### 2. 网页回调流（Web Loopback OAuth Flow）优势
- **极致流畅（VS Code 级别）**：点击“使用浏览器登录 Google”按钮后，客户端通过 Tauri Opener 自动拉起系统默认浏览器。
- **零手抄交互**：在浏览器完成 Google 登录授权后，Google 自动重定向带回 `code` 参数至本地临时 HTTP 端口。
- **隐形解耦与持久化**：后端成功捕获凭证后向网页推送优雅的成功 HTML，并在后台向谷歌换取 Token 存入本地安全层，最后通过 Tauri 事件推送通知前端登录完成。

---

## 核心实现代码说明

### 1. Rust 后端动态 HTTP 回调监听器 ([src-tauri/src/lib.rs](file:///d:/AI_Tools/Celatura-desktop/src-tauri/src/lib.rs))
- **`start_google_oauth` Command**：
  * 使用 `tiny_http::Server::http("127.0.0.1:0")` 绑定操作系统分配的随机空闲端口。
  * 拼装标准 Web OAuth 授权 URL：`https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=http://127.0.0.1:{port}&response_type=code&scope=...&access_type=offline&prompt=consent`。
  * 调用 `tauri_plugin_opener::open_url` 打开系统默认浏览器。
  * 在 `tokio::task::spawn_blocking` 中捕获并处理 `GET /?code=...` 请求，输出 HTML 成功响应。
  * 换取 Token 存入 `AppState` 与本地持久化文件，并调用 `window.emit("oauth-success", auth_token)` 通知前端。

---

### 2. 前端 AuthCard 组件重构 ([src/components/AuthCard.tsx](file:///d:/AI_Tools/Celatura-desktop/src/components/AuthCard.tsx))
- 提供“使用浏览器登录 Google”交互按钮。
- 绑定监听 `oauth-success` 事件，一旦接收到凭证，瞬间无缝完成登录过渡。

---

## [2026-07-23 02:49:30] 验证结果

- **后端 Rust 编译**：`cargo check` 通过（`Finished dev profile in 2.04s`）。
- **前端 Web 打包**：`npm run build` 成功静态导出。
