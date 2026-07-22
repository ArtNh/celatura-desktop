# Celatura

> **Celatura · 精雕每一次 AI 对话**  
> *Carve Your AI Conversation*

---

### 项目简介

Celatura 取自“雕刻、雕琢”（Celature）之意，寓意精细打磨 AI 对话交互体验。

本项目是一款基于 **Tauri 2.0** 架构开发的跨平台原生 Gemini AI 桌面客户端。项目原生支持 Google 官方 OAuth 设备授权登录流（Device Authorization Flow），无需手动申请或填写复杂的 Gemini API Key，同时提供双鉴权自由切换。

Celatura 采用纯自研图形界面，完全脱离任何终端黑框或 CLI 工具套壳，旨在为用户提供轻量、安全、优雅且高度自定义的桌面级 AI 对话体验。

---

### 核心亮点

| 亮点特性 | 架构实现与优势说明 |
| :--- | :--- |
| **高安全凭证隔离** | 所有 OAuth 令牌（Access Token / Refresh Token）与 API 密钥仅驻留在 Rust 后端进程内存及加密存储中，前端 JavaScript 无法直接读取敏感凭证，有效防御 XSS 攻击与凭证泄露。 |
| **极致轻量运行** | 依托 Tauri 2 引擎与系统原生 Webview，安装包体积仅数 MB，内存与 CPU 占用相比传统 Electron 框架客户端大幅缩减 80% 以上。 |
| **合规官方登录** | 严格遵循 Google Cloud 官方规范，接入专为桌面终端设计的设备授权流（OAuth Device Code Flow），无需在本地开启回调端口，实现免手动配置 Key 的安全登录。 |
| **原生独立 GUI** | 纯自研 Vue 3 气泡式对话界面，支持流畅的打字机流式输出、打字动画与丰富主题，提供极高自由度的定制化功能。 |
| **全平台一键打包** | 基于统一的 Rust + Web 架构，支持无缝构建出 Windows (.msi/.exe Installer)、macOS (.dmg/.app) 以及 Linux (.AppImage/.deb) 原生安装包。 |

---

### 核心功能清单

```
===================================================================================
                               Celatura 功能架构视图
===================================================================================
 ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐   ┌──────────────┐
 │  谷歌 OAuth 登录 │   │   双鉴权隔离存储 │   │ 多模态流式交互  │   │ 本地加密存储 │
 └────────┬────────┘   └────────┬────────┘   └────────┬────────┘   └──────┬───────┘
          │                     │                     │                   │
 ┌────────┴────────┐   ┌────────┴────────┐   ┌────────┴────────┐   ┌──────┴───────┐
 │ 多会话导出管理  │   │ 全局网络代理配置 │   │ 系统托盘常驻唤起 │   │ 模型参数自定义│
 └─────────────────┘   └─────────────────┘   └─────────────────┘   └──────────────┘
===================================================================================
```

#### 1. 谷歌账号设备码 OAuth 自动登录
- 采用 Google Device Authorization Flow 标准架构。
- 启动后自动生成设备验证码与授权 URL，扫描或点击即可完成登录。
- 后端后台静默轮询鉴权状态，自动获取 Gemini 访问令牌。
- 支持 `refresh_token` 后台无感自动续期，登录状态持久有效，避免频繁重复授权。

#### 2. 双鉴权模式隔离与自由切换
- 支持 **Google 账号 OAuth 登录** 与 **手动输入 Gemini API Key** 双重鉴权模式。
- 两套凭证在底层进行物理隔离加密存储，切换模式时配置互不干扰。

#### 3. 完整多模态对话能力
- **文本交互**：高响应度的实时打字机流式逐字输出。
- **图片解析**：支持本地图片拖拽上传、剪贴板粘贴与多图解析。
- **文档解析**：支持常见文本与代码文档的上传读入及上下文问答。

#### 4. 本地加密持久化存储
- 使用 Rust 层的加密存储组件持久化凭证与聊天数据。
- 账号令牌、对话历史记录、系统配置参数均经过加密处理，避免明文泄露。

#### 5. 多会话标签管理与导出
- 支持快速新建、删除、重命名对话会话。
- 支持对话记录一键导出为标准的 Markdown 文件，方便归档与二次编辑。

#### 6. 全局网络代理中转（HTTP / SOCKS5）
- 内置网络代理配置模块，支持 HTTP 与 SOCKS5 协议。
- 统一由 Rust reqwest 网络层处理代理路由，完美适配国内连接 Google 服务与 API 的网络环境。

#### 7. 桌面原生增强功能
- **系统托盘**：常驻系统任务栏/菜单栏，支持后台无感运行。
- **全局快捷键**：配置 Hotkey 实现快速唤起或隐藏应用窗口。
- **剪贴板联动**：支持快捷键一键读取剪贴板内容并填入对话框发送。

#### 8. 模型与参数自定义配置
- 支持全系 Gemini 模型（包括 Gemini 1.5 Pro、Gemini 1.5 Flash 及最新预览版模型）自由切换。
- 动态调节 Temperature（随机性）、Top-P、Max Output Tokens（最大输出长度）。
- 支持自定义全局或会话级 System Prompt（系统预设提示词）。

---

### 技术栈说明

> **架构设计原则**：前后端分离、密钥不出后端、Native Performance First。

* **桌面底层架构**：Tauri 2.0 (Rust)
  * 提供跨平台原生窗口控制、系统托盘、全局快捷键管理以及安全文件 IPC 通信。
* **前端视图界面**：Vue 3 + Vite + Tailwind CSS / 现代化 UI 组件库
  * 构建高流畅度的对话气泡 UI、设置面板与多会话侧边栏。
* **网络中转层**：Rust reqwest
  * 所有面向 Google OAuth 终端与 Gemini API 的 HTTP 请求均由 Rust reqwest 接管，隔离 API Key 与 Token，避免暴露前端网络请求栈。
* **本地安全存储**：`tauri-plugin-store` 加密持久化
  * 加密存储软件配置、会话上下文及身份认证凭证。
* **鉴权协议标准**：Google Device Authorization Flow (OAuth 2.0 for Devices)
  * 专为无浏览器回调接收能力或桌面客户端设计的合规授权流。

---

### 仓库目录结构

```text
celatura-desktop/
├── src-tauri/               # Tauri 2.0 Rust 后端工程
│   ├── src/                 # Rust 核心业务逻辑
│   │   ├── auth/            # Google OAuth 设备码授权流实现
│   │   ├── api/             # Gemini API 客户端与流式解析器
│   │   ├── store/           # 加密存储模块
│   │   ├── proxy/           # 网络代理设置与 reqwest 构建器
│   │   └── main.rs          # 应用入口与 Tauri 指令注册
│   ├── Cargo.toml           # Rust 依赖清单
│   └── tauri.conf.json      # Tauri 配置文件（窗口、插件、权限）
├── src/                     # Vue 3 前端工程
│   ├── assets/              # 样式文件与图标资源
│   ├── components/          # 对话、设置、侧边栏等 UI 组件
│   ├── stores/              # Pinia 状态管理
│   ├── types/               # TypeScript 类型定义
│   ├── App.vue              # 应用主界面
│   └── main.ts              # Vue 初始化入口
├── Markdown_Notes/          # 项目实施笔记与开发日志归档
├── package.json             # Node.js 项目依赖与构建脚本
└── README.md                # 项目官方说明文档
```

---

### 开发前置依赖与配置指引

> [!IMPORTANT]
> **网络配置提示**：国内开发与使用环境必须在软件配置或系统环境变量中设定 HTTP / SOCKS5 代理，否则无法正常发起 Google Cloud OAuth 认证及 Gemini API 请求。

#### 1. 基础编译环境
* **Node.js**：`>= 20.0.0`
* **Rust Toolchain**：`rustc >= 1.75` / `cargo`
* **包管理器**：`pnpm`（推荐）或 `npm`

#### 2. Google Cloud OAuth 桌面凭证配置

为了启用谷歌账号一键 OAuth 登录功能，需要在 Google Cloud Console 中获取桌面应用凭证：

1. 登录 [Google Cloud Console](https://console.cloud.google.com/) 并新建或选择已有的 GCP 项目。
2. 导航至 **API 和服务** -> **凭证 (Credentials)**。
3. 点击 **创建凭证** -> 选择 **OAuth 客户端 ID (OAuth client ID)**。
4. **应用类型** 选择：`桌面应用 (Desktop App)`。
5. 创建成功后，获取 `Client ID` 与 `Client Secret`。
6. 将获取的 Client ID 填入 `src-tauri/src/auth/config.rs` 或指定的环境变量中：
   ```env
   GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="YOUR_GOOGLE_CLIENT_SECRET"
   ```

---

### 本地开发与打包构建命令

#### 1. 安装项目依赖

```bash
# 安装前端工程依赖
pnpm install
```

#### 2. 启动本地开发模式

```bash
# 启动前端 Vite 服务并拉起 Tauri 原生桌面窗口
pnpm tauri dev
```

#### 3. 构建生产打包产物

```bash
# 自动编译 Rust 后端与前端产物，生成桌面安装包
pnpm tauri build
```

构建完成后，产物输出路径：
* **Windows**: `src-tauri/target/release/bundle/msi/` 及 `bundle/nsis/`
* **macOS**: `src-tauri/target/release/bundle/dmg/` 及 `bundle/macos/`
* **Linux**: `src-tauri/target/release/bundle/appimage/` 及 `bundle/deb/`

---

### 开源协议

本项目基于 [MIT License](LICENSE) 协议开源。
