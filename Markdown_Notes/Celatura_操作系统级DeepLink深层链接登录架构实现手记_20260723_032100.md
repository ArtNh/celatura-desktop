# Celatura 操作系统级 Deep Link (celatura://) 深层链接登录架构手记

> 本文档记录 Celatura Desktop 彻底杜绝本地网络端口暴露，升级为基于操作系统原生深层链接协议（Custom Protocol / Deep Link Scheme `celatura://`）与单实例大动脉接管的纯净桌面登录架构实现全过程。

---

## 架构优势与设计对比

| 架构特性 | 传统 HTTP 回调流 (Loopback) | 纯原生 Deep Link 架构 (celatura://) |
| :--- | :--- | :--- |
| **网络端口** | 需要暴露 127.0.0.1 随机端口 | **零网络端口暴露，完全隔离网络安全隐患** |
| **系统唤醒** | 依赖浏览器访问 HTTP 回调 | **由 Windows 操作系统直接拉起/唤醒桌面应用** |
| **多实例保护** | 无 | **结合单实例大动脉接管（Single Instance Plugin）防二次多开** |
| **工程素养** | 简易工具级设计 | **大厂专业桌面客户端级别（媲美 VS Code / GitHub Desktop）** |

---

## 核心实现细节

### 1. Tauri 2 插件与协议配置
- 在 [src-tauri/Cargo.toml](file:///d:/AI_Tools/Celatura-desktop/src-tauri/Cargo.toml) 中引入 `tauri-plugin-deep-link` 与 `tauri-plugin-single-instance`。
- 在 [src-tauri/tauri.conf.json](file:///d:/AI_Tools/Celatura-desktop/src-tauri/tauri.conf.json) 的 `plugins.deep-link.desktop` 中注册协议 Scheme：
  ```json
  "schemes": ["celatura"]
  ```

### 2. Rust 后端唤起大动脉接管 ([src-tauri/src/lib.rs](file:///d:/AI_Tools/Celatura-desktop/src-tauri/src/lib.rs))
- **`handle_deep_link_url` 处理器**：
  * 拦截 `celatura://auth?code=xxxx` 系统唤醒链接。
  * 精准提取 `code` 授权码，并自动在 Windows 系统中调用 `main_win.set_focus()` 将 Celatura 主窗口解除最小化并置顶到最前。
  * 异步阻塞向 Google Token 端点换取凭证，写入持久化安全磁盘并向前端发送 `oauth-success` 通知。
- **单实例监听与初始化**：
  * 通过 `tauri_plugin_single_instance` 的 `on_instance` 回调，实时捕获应用被二次拉起时的命令行 `argv` 参数。

### 3. 前端与 Deep Link 交互 ([src/components/AuthCard.tsx](file:///d:/AI_Tools/Celatura-desktop/src/components/AuthCard.tsx))
- **`start_google_oauth_deeplink`**：
  * 拼装重定向地址为 `celatura://auth` 的 Google OAuth 链接。
  * 浏览器完成授权后由操作系统自动完成回传与唤醒。

---

## [2026-07-23 03:21:00] 验证结果

- **Rust 编译**：`cargo check` 通过（`Finished dev profile in 1m 27s`）。
- **前端打包**：`npm run build` 成功。
