# Flux 面板 (Flux Monitor)

[English](#english) | [简体中文](#简体中文)

---

<a name="english"></a>

## English

A system monitoring and management dashboard designed for **Macs running as servers**.

### Features

- **System Monitor**: Display CPU, memory, disk, and network usage.
- **Process Management**: View running processes and monitor resource consumption.
- **Log Analysis**: Browse system logs with optional AI status interpretation.
- **Configuration Management**: Edit system configuration files.
- **LaunchAgent**: Manage macOS LaunchAgents and LaunchDaemons.
- **Docker**: Manage containers and images.
- **Nginx**: Manage sites and global configurations.
- **OpenClaw**: View process and memory statistics.
- **Optional AI Assistant**: Connect an OpenAI API key for log parsing, configuration auditing, and troubleshooting suggestions.

---

<a name="简体中文"></a>

## 简体中文

一款专为**作为服务器运行的 Mac** 设计的监控与服务管理面板。

### 功能

- **系统概览**: 显示 CPU、内存、磁盘使用率及网络流量。
- **进程管理**: 展示运行进程及其资源消耗。
- **日志分析**: 查看系统日志（支持选配 AI 诊断）。
- **配置文件管理**: 编辑并管理系统配置文件。
- **自启服务管理**: 管理 macOS 的 LaunchAgents 与 LaunchDaemons 服务。
- **Docker**: 管理容器与镜像。
- **Nginx**: 管理站点及全局配置。
- **OpenClaw**: 查看进程及内存统计信息。
- **选配 AI 助手**: 绑定 OpenAI API 密钥后，可使用日志诊断、参数配置审查及故障排查辅助功能。

---

## Screenshots / 界面截图

![Screenshot 1](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311163944.jpg)
![Screenshot 2](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164044.jpg)
![Screenshot 3](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164146.jpg)
![Screenshot 4](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164227.jpg)
![Screenshot 5](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164249.jpg)
![Screenshot 6](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164316.jpg)
![Screenshot 7](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164341.jpg)
![Screenshot 8](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164412.jpg)
![Screenshot 9](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164523.jpg)
![Screenshot 10](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164539.jpg)
![Screenshot 11](screenshots/iScreen%20Shoter%20-%20Safari%E6%B5%8F%E8%A7%88%E5%99%A8%20-%20260311164605.jpg)

---

## Getting Started / 开始使用

1. **Install / 安装**:
   ```bash
   npm install
   ```

2. **Run / 运行**:
   ```bash
   npm run dev
   ```

3. **AI Configuration / 配置 AI 引擎 (Optional / 可选)**:
   To use the optional AI-assisted features, configure your OpenAI API Key and endpoint in `config.json` or through the dashboard Settings page.
   若要使用选配的 AI 辅助功能，请在设置页面内或编辑 `config.json` 文件添加 OpenAI API 密钥和接口。

## Deployment / 部署打包

This project provides a deploy script `deploy.sh`. It builds the Next.js application as a standalone server and installs it to the specified directory (default: `~/Applications/monitor`).

本项目提供了一个部署脚本 `deploy.sh`。执行脚本会将 Next.js 应用编译并提取为独立的 Standalone 服务，安装到指定目录（默认路径：`~/Applications/monitor`）。

```bash
# Grant execution permissions and deploy / 赋予执行权限并构建发布版本
chmod +x deploy.sh
./deploy.sh
```

**Notes (说明):**
- You can change the deployment folder by editing the `"deploy.path"` key in `config.json`. 
  (若要更改存放目录，请修改 `config.json` 中的 `deploy.path` 字段)。
- After deployment, the script uses `start.sh` to run the app in the background on the configured port (default `7000`). 
  (部署完成后，将生成 `start.sh` 并自动将面板挂载在后台相应的端口运行，默认为 `7000`)。

## Configuration / 配置文件说明 (`config.json`)

The system uses `config.json` for global settings. You can copy `config.example.json` to create one if it doesn't exist.
系统通过 `config.json` 作为全局配置。初始时可复制 `config.example.json` 来创建。

```json
{
  "users": [
    {
      "username": "admin",
      "password": "password123" // The dashboard login credentials (登录账号密码)
    }
  ],
  "jwtSecret": "CHANGE_ME", // The secret key for JWT session tokens (用于会话Token的密钥，务必修改)
  "ai": {
    "url": "https://api.openai.com/v1", // OpenAI-compatible API Endpoint (兼容OpenAI的接口地址)
    "key": "", // API Key for the AI assistant (AI 助手密钥)
    "model": "gpt-4o-mini" // AI model name (使用的 AI 模型)
  },
  "features": {
    "monitor": true, // Enable/disable specific modules in the sidebar (开启/关闭侧边栏可见的功能模块)
    "processes": true,
    "logs": true,
    "configs": true,
    "launchagent": true,
    "docker": true,
    "nginx": true,
    "openclaw": true
  },
  "deploy": {
    "path": "~/Applications/monitor", // Target path for deploy.sh (一键部署的目标路径)
    "port": 7000 // The port to run the dashboard on after deployment (部署后运行的端口号)
  }
}
```

---

© 2026 Flux.
