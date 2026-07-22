# Celatura Tauri 2 编译与 Build Script 报错修复手记

> 本文档记录对 `pnpm tauri dev` 过程中出现的 `OUT_DIR env var is not set` 错误以及 `E0255: the name __cmd__... is defined multiple times` 编译报错问题的排查与修复方案。

---

## 诊断背景与问题描述

### 报错现象
```text
error: OUT_DIR env var is not set, do you have a build script?
   --> src\lib.rs:468:14
    |
468 |         .run(tauri::generate_context!())

error[E0255]: the name `__cmd__request_device_code` is defined multiple times
```

### 根本原因分析
1. **构建脚本未声明 (`build.rs`)**：`src-tauri/Cargo.toml` 中缺少 `build = "build.rs"` 显式配置，导致 Cargo 在编译期未触发 `tauri_build::build()`，从而没有为全局生成 `OUT_DIR` 环境变量，导致 `tauri::generate_context!()` 展开失败。
2. **宏重复定义二次衍生 (`E0255`)**：在缺少 `OUT_DIR` 上下文的失败宏展开过程中，`#[tauri::command]` 过程宏生成的临时代码在同一命名空间中发生污染与冲突。

---

## 修复实施细节

### 1. [src-tauri/Cargo.toml](file:///d:/AI_Tools/Celatura-desktop/src-tauri/Cargo.toml) 配置更新
在 `[package]` 结构中补充显式构建脚本路径定义：

```toml
[package]
name = "celatura-desktop"
version = "0.1.0"
description = "Cross-platform Native Gemini AI Desktop Client powered by Tauri 2"
authors = ["ArtNh"]
edition = "2021"
build = "build.rs"
```

### 2. [src-tauri/build.rs](file:///d:/AI_Tools/Celatura-desktop/src-tauri/build.rs) 构建脚本确认
```rust
fn main() {
    tauri_build::build();
}
```

---

## [2026-07-23 01:46:15] 验证结果

> **验证状态**：`cargo check` 运行通过（`Finished dev profile in 36.65s`），错误完全消除。
