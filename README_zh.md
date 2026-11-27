# 浮光面板

[English](README.md) | **简体中文**

---

一款为你的 Mac 设计的监控、管理与远程控制面板。

**macOS 启动器:** 

[![下载 macOS 版](https://img.shields.io/badge/下载-macOS%20版-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/chentao1006/FluxMonitor/releases/latest/download/FluxMonitor.dmg)

```bash
brew install --cask chentao1006/tap/flux-monitor
```

**移动端:** 

[![Download on the App Store](public/app-store-badge-zh.svg)](https://apps.apple.com/app/flux-remote/id6761290185)
[![Get it on Google Play](public/en-play-badge.png)](https://play.google.com/store/apps/details?id=com.ct106.flux_remote)


### 功能

- **系统概览**: 显示 CPU、内存、磁盘使用率及网络流量，运行终端命令。
- **进程管理**: 展示运行进程及其资源消耗。
- **端口管理**: 查看监听与活跃端口，定位占用进程并释放端口。
- **防火墙**: 基于 macOS PF，按顺序匹配规则，按来源地址（CIDR）放行或拦截入站端口，一键启用或禁用。规则重启后自动恢复，本机主动发起的连接回包不会被拦截。
- **日志分析**: 查看系统日志。
- **配置文件管理**: 编辑并管理系统配置文件。
- **自启服务管理**: 管理 macOS 的 LaunchAgents 与 LaunchDaemons 服务。
- **Docker**: 管理容器与镜像。
- **Nginx**: 管理站点及全局配置。
- **选配 AI 助手**: 绑定 OpenAI API 密钥后，可使用日志诊断、参数配置审查及故障排查辅助功能。
- **公网访问 (InstaTunnel)**: 一键开启公网访问，无需账号或复杂配置，安全便捷。

**待开发功能**

- [x] **浮光面板启动器**: 原生 macOS 应用程序，可启动本地监控服务，无需手动部署。
- [x] **iOS 客户端**: 原生 iOS 应用程序，可随时随地监控和管理系统。([App Store](https://apps.apple.com/app/flux-remote/id6761290185))
- [x] **Android 客户端**: 原生 Android 应用程序，可随时随地监控和管理系统。([Google Play](https://play.google.com/store/apps/details?id=com.ct106.flux_remote))

---

## 界面截图

![Screenshot 1](screenshots/zh/000001.jpg)
![Screenshot 2](screenshots/zh/000002.jpg)
![Screenshot 3](screenshots/zh/000003.jpg)
![Screenshot 4](screenshots/zh/000004.jpg)
![Screenshot 5](screenshots/zh/000005.jpg)
![Screenshot 6](screenshots/zh/000006.jpg)
![Screenshot 7](screenshots/zh/000007.jpg)
![Screenshot 8](screenshots/zh/000008.jpg)
![Screenshot 9](screenshots/zh/000009.jpg)

## 安装与设置

### 1. macOS 启动器
在 macOS 上使用“浮光”最简单的方法是下载应用程序。它会自动启动后端服务并提供菜单栏图标。

[![下载 macOS 版](https://img.shields.io/badge/下载-macOS%20版-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/chentao1006/FluxMonitor/releases/latest/download/FluxMonitor.dmg)

- **安装**: 将 **Flux Monitor** 拖入 **Applications** (应用程序) 文件夹。
- **启动**: 打开应用程序即可开启监控面板。

#### Homebrew Cask
也可以通过 Homebrew 安装 macOS 启动器：

```bash
brew install --cask chentao1006/tap/flux-monitor
```

或先添加 tap：

```bash
brew tap chentao1006/tap
brew install --cask flux-monitor
```

### 2. 移动端客户端 (iOS & Android)
在手机或平板上随时随地远程连接、监控并控制你的 Mac。

[![Download on the App Store](public/app-store-badge-zh.svg)](https://apps.apple.com/app/flux-remote/id6761290185)
[![Get it on Google Play](public/en-play-badge.png)](https://play.google.com/store/apps/details?id=com.ct106.flux_remote)


---

## 开始使用 (源码 / 开发)

1. **安装**:
   ```bash
   npm install
   ```

2. **运行**:
   ```bash
   npm run dev
   ```

3. **配置 AI 引擎 (可选)**:
   若要使用选配的 AI 辅助功能，请在设置页面内或编辑 `config.json` 文件添加 OpenAI API 密钥和接口。

## 部署打包

本项目提供了一个部署脚本 `deploy.sh`。执行脚本会将 Next.js 应用编译并提取为独立的 Standalone 服务，安装到指定目录（默认路径：`~/Applications/flux-monitor`）。

```bash
# 赋予执行权限并构建发布版本
chmod +x deploy.sh
./deploy.sh
```

**说明:**
- 若要更改存放目录，请修改 `config.json` 中的 `deploy.path` 字段.
- 部署完成后，将生成 `start.sh` 并自动将面板挂载在后台相应的端口运行，默认为 `4210`。

## 防火墙配置（可选）

**防火墙** 页面通过一个系统管理组件操作 macOS PF，安装时需要一次管理员授权。任选一种方式：

- **启动器（推荐）**：首次设置时点击 **启用防火墙管理**，或之后在启动器的 **组件** 页打开 **防火墙管理** 开关。在 macOS 授权框中确认一次，之后远程使用面板也不再需要授权。
- **网页面板**：组件未安装时，防火墙页面会显示 **安装组件** 按钮。授权窗口会出现在运行浮光面板的 Mac 上，而不是浏览器里。
- **不需要？** 在启动器中点击 **不需要**，或在 **组件** 页关闭开关。面板会隐藏防火墙模块（`features.firewall: false`），以后也不再提示。启动器与面板设置中的模块开关保持同步。

关闭防火墙管理只会隐藏模块，已应用的规则仍然生效。如需移除规则，请在 **组件** 页点击 **卸载组件**（已保存的规则会保留，重新安装后自动恢复）。

安装完成后，在防火墙页面顶部点击 **启用防火墙** / **禁用防火墙**，并在下方编辑入站规则。规则从上往下匹配，第一条命中即生效。

### 安装内容

安装会放置 `/Library/PrivilegedHelperTools/com.ct106.flux-monitor-pf`，写入受限的 `/etc/sudoers.d/com_ct106_flux_monitor_pf` 规则，并注册用于开机恢复规则的 LaunchDaemon。针对入站拒绝规则覆盖的本机端口与远端地址，管理组件会自动生成非 quick 的 `pass out ... keep state` 规则，确保本机主动出站请求的回包不被拦截。

### 命令行手动安装

适用于 SSH 远程或脚本化安装。组件会授权给执行 `sudo` 的用户（或通过 `--user` 指定的用户），该用户必须是运行浮光面板的账号。

从源码目录安装：

```bash
sudo ./scripts/pf/setup.sh install
```

从 `deploy.sh` 部署目录安装：

```bash
sudo ~/Applications/flux-monitor/pf/setup.sh install
```

从已安装的 macOS 应用包安装：

```bash
sudo "/Applications/Flux Monitor.app/Contents/Resources/pf/setup.sh" install
```

如需防止规则意外阻断指定管理地址的 SSH 与面板端口，可在安装时同时传入以下三个参数（重新安装时传入 `--clear-management` 可移除管理锁定配置）：

```bash
sudo ./scripts/pf/setup.sh install \
  --management-address 192.0.2.10 \
  --ssh-port 22 \
  --panel-port 4210
```

查看状态或卸载：

```bash
sudo ./scripts/pf/setup.sh status
sudo ./scripts/pf/setup.sh uninstall
sudo ./scripts/pf/setup.sh uninstall --purge
```

传入 `--purge` 会一并删除 `/var/db/com.ct106.flux-monitor-pf` 中保存的策略文件。

## 配置文件说明 (`config.json`)

系统通过 `config.json` 作为全局配置。初始时可复制 `config.example.json` 来创建。

```json
{
  "users": [
    {
      "username": "admin",
      "password": "password123" // 登录账号密码
    }
  ],
  "jwtSecret": "CHANGE_ME", // 用于会话 Token 的密钥，务必修改
  "ai": {
    "url": "https://api.openai.com/v1", // 兼容 OpenAI 的接口地址
    "key": "", // AI 助手密钥
    "model": "gpt-4o-mini" // 使用的 AI 模型
  },
  "features": {
    "monitor": true, // 开启/关闭侧边栏可见的功能模块
    "processes": true,
    "ports": true,
    "firewall": true,
    "logs": true,
    "configs": true,
    "launchagent": true,
    "docker": true,
    "nginx": true
  },
  "deploy": {
    "path": "~/Applications/flux-monitor", // 一键部署的目标路径
    "port": 4210 // 部署后运行的端口号
  }
}
```

---

© 2026 Flux Monitor.
