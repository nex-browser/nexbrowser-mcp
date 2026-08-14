# NexBrowser MCP Server

[English](README.md) | 简体中文

将 Codex、Claude Code、Claude Desktop、Cursor 等 MCP 客户端连接到 NexBrowser Desktop，
用于管理浏览器环境和执行浏览器自动化。

> 使用前必须启动 NexBrowser Desktop 并开启 **NexBrowser OpenAPI**。本包是 MCP 适配器，
> 不是独立浏览器。

## 快速开始

### 1. 开启 NexBrowser OpenAPI

1. 启动 [NexBrowser Desktop](https://nexbrowser.net/en/download/)。
2. 打开 **API MCP**，开启 **NexBrowser OpenAPI**。
3. 复制页面显示的 API Key。默认地址为 `http://127.0.0.1:45536`。

需要 Node.js 18 或更高版本，推荐 Node.js 20 或更高版本。

### 2. 添加 MCP 服务

将 `<your-openapi-token>` 替换为 NexBrowser Desktop 中显示的 API Key。

Codex：

```bash
codex mcp add nexbrowser \
  --env NEX_API_KEY=<your-openapi-token> \
  --env NEX_API_HOST=http://127.0.0.1:45536 \
  -- npx -y @nexbrowser/mcp@latest
```

Claude Code：

```bash
claude mcp add nexbrowser \
  --env NEX_API_KEY=<your-openapi-token> \
  --env NEX_API_HOST=http://127.0.0.1:45536 \
  -- npx -y @nexbrowser/mcp@latest
```

其他 MCP 客户端：

```json
{
  "mcpServers": {
    "nexbrowser": {
      "command": "npx",
      "args": ["-y", "@nexbrowser/mcp@latest"],
      "env": {
        "NEX_API_HOST": "http://127.0.0.1:45536",
        "NEX_API_KEY": "<your-openapi-token>"
      }
    }
  }
}
```

修改配置后，请重启或重新加载 MCP 客户端。

### 3. 安装自动化 Skill（可选）

该 Skill 帮助兼容的 Agent 选择工具、使用页面快照引用，并从常见错误中恢复。

```bash
npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser-automation
```

## 能力范围

- 环境管理：列出、启动、关闭和查看 NexBrowser 环境。
- 窗口分组：查看分组及各分组窗口数、创建分组、删除自建分组，以及把窗口移入或移出分组。
- 页面自动化：连接、导航、点击、输入、上传文件和管理标签页。
- 页面检查：获取快照、截图、可见文本、控制台消息和网络请求。
- 会话隔离：每个 MCP 进程独立持有浏览器会话和活动标签页状态。

常用工具：

```text
nex_browser_list              nex_browser_open
nex_browser_close             nex_browser_connect
nex_browser_tab_list          nex_browser_snapshot
nex_browser_click             nex_browser_fill_form
nex_browser_take_screenshot   nex_browser_network_requests
```

完整工具目录通过 MCP `tools/list` 提供，工具权限最终由 NexBrowser Desktop 控制。

## 配置参数

| 变量             | 必填 | 默认值                   | 说明                                |
| ---------------- | ---- | ------------------------ | ----------------------------------- |
| `NEX_API_KEY`    | 是   | —                        | NexBrowser OpenAPI 签发的 API Key。 |
| `NEX_API_HOST`   | 否   | `http://127.0.0.1:45536` | NexBrowser OpenAPI 基地址。         |
| `NEX_TIMEOUT`    | 否   | `30000`                  | 请求超时时间，单位毫秒。            |
| `NEX_EXPOSE_CDP` | 否   | 关闭                     | 仅在需要原始 CDP 地址时设置为 `1`。 |

对应的 CLI 参数为 `--api-key`、`--api-host`、`--timeout` 和 `--expose-cdp`。环境变量更适合
传递密钥，因为命令行参数可能保留在 Shell 历史记录中，或被本机其他进程看到。

## 故障排查

- **连接失败：**确认 NexBrowser Desktop 正在运行，并且 OpenAPI 已开启。
- **Unauthorized：**重新复制当前 API Key，并更新 `NEX_API_KEY`。
- **Not found：**将 NexBrowser Desktop 更新到支持 **API MCP** 和统一 `/automation/*` 接口的版本。
- **配置后没有工具：**重启或重新加载 MCP 客户端。
- **修改了端口：**将 `NEX_API_HOST` 设置为 NexBrowser Desktop 显示的地址。

软件包版本请查看 [GitHub Releases](https://github.com/nex-browser/nexbrowser-mcp/releases)。

## 安全说明

- 除非明确需要远程访问，否则 OpenAPI 应仅绑定回环地址。
- 不要提交或公开 API Key、包含 Key 的 MCP 配置、截图或日志。
- 重置 API Key 后，原 Key 会立即失效。
- 页面快照、截图、页面内容、控制台输出和网络日志可能包含敏感信息，并可能被发送给配置的
  模型服务商。
- 仅在需要时启用页面脚本、代码执行、本地文件访问或原始 CDP 地址。

授权和文件访问策略始终由 NexBrowser Desktop 执行。

## 软件包用法

直接运行 MCP 服务：

```bash
npx -y @nexbrowser/mcp@latest
```

或全局安装 CLI：

```bash
npm install --global @nexbrowser/mcp
nexbrowser-mcp
```

嵌入其他 MCP 宿主：

```ts
import { NexBrowserMcpServer } from '@nexbrowser/mcp';

const server = new NexBrowserMcpServer({
  apiHost: 'http://127.0.0.1:45536',
  apiKey: process.env.NEX_API_KEY ?? '',
  timeout: 30_000
});

await server.connect(transport);
await server.close();
```

## 开发

仓库使用 Node.js 24.19.0 和 pnpm 11 开发，发布包支持 Node.js 18 或更高版本。

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
pnpm inspect
```

真实 Desktop 集成测试默认关闭。请仅使用专用测试窗口和 API Key 运行：

```bash
NEX_E2E_ENABLED=1 NEX_E2E_WINDOW_ID=your-test-window NEX_API_KEY=your-test-key pnpm test:integration
```
