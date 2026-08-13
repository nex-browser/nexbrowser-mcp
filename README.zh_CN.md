# NexBrowser MCP Server

[English](README.md) | 简体中文

将 Claude Desktop、Cursor 等 MCP 客户端连接至正在运行的 NexBrowser 桌面应用。本包通过
stdio 实现 Model Context Protocol（MCP），并把已授权的工具调用转发给桌面应用的本地
OpenAPI 服务。

> 本包是 MCP 协议适配器，不是独立浏览器运行时。使用前必须启动 NexBrowser Desktop，并启用
> NexBrowser OpenAPI 服务。

## 能力范围

- 环境管理：列出、启动、关闭和读取 NexBrowser 环境信息。
- 浏览器自动化：连接环境、查看页面、生成快照或截图、操作页面元素，以及读取 console 和
  network 记录。
- 会话隔离：每个 MCP 进程都有独立的 `X-Nex-Client-Id` 标识，浏览器 session 和活动标签
  不会在不同 MCP 客户端之间共享。

Playwright/CDP 句柄和页面执行等策略受控能力始终由 Electron 主进程掌管。

## 前置条件

1. [下载](https://nexbrowser.net/en/download/)并启动 NexBrowser Desktop。
2. [开启 NexBrowser OpenAPI](#开启-nexbrowser-openapi)，并取得 OpenAPI token。
3. MCP 客户端运行环境支持 Node.js 18 或更高版本。由于 Node.js 18 已停止官方维护，推荐使用
   Node.js 20 或更高版本。

在托管环境固定版本之前，请先查看[版本兼容性](#版本兼容性)。

不要将真实 OpenAPI token 提交到仓库、粘贴到共享配置或发布到 issue。

## 开启 NexBrowser OpenAPI

1. 在 NexBrowser Desktop 导航栏打开 **API MCP**。
2. 开启 **NexBrowser OpenAPI**。服务仅监听 `127.0.0.1`，默认端口为 `45536`。
3. 复制页面显示的 API 密钥，并在 MCP 客户端配置中设置为 `NEX_API_KEY`。
4. 如果修改了端口，请同步更新 `NEX_API_HOST`，使其与页面显示的访问地址一致。

请保持服务仅绑定回环地址。重置 API 密钥后旧密钥会立即失效，需要同步更新所有已授权的
MCP 客户端。

## 版本兼容性

| 组件               | 支持版本                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------- |
| NexBrowser MCP     | `2026.8.12-beta.1`（[版本发布](https://github.com/nex-browser/nexbrowser-mcp/releases)） |
| NexBrowser Desktop | 包含 **API MCP** 页面及统一 `/automation/*` 接口的当前版本                               |
| Node.js 运行时     | `>=18`；推荐 Node.js 20 或更高版本                                                       |

如果自动化工具返回 `Not found`，请先更新 NexBrowser Desktop。版本 1.0.6 仅公开统一的
`nex_browser_*` 命名空间，不再注册原工具名。

## 安装

如果 MCP 客户端通过 `npx` 启动服务，无需安装：

```bash
npx -y @nexbrowser/mcp
```

如需获得全局 `nexbrowser-mcp` 命令，可全局安装：

```bash
npm install --global @nexbrowser/mcp
```

## 配置 MCP 客户端

在 MCP 客户端配置中添加以下服务。请将 token 替换为当前本机 NexBrowser 应用生成的值。

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

若已全局安装，可将 `"command"` 改为 `"nexbrowser-mcp"` 并去掉 `args`。

### Codex 和 Claude Code

如需通过命令行直接注册已发布的 MCP 服务，可使用以下任一命令。请将
`<your-openapi-token>` 替换为 NexBrowser Desktop 中显示的 API 密钥。

Codex：

```bash
codex mcp add nexbrowser \
  --env NEX_API_KEY=<your-openapi-token> \
  --env NEX_API_HOST=http://127.0.0.1:45536 \
  --env NEX_TIMEOUT=30000 \
  -- npx -y @nexbrowser/mcp@latest
```

Claude Code：

```bash
claude mcp add nexbrowser \
  --env NEX_API_KEY=<your-openapi-token> \
  --env NEX_API_HOST=http://127.0.0.1:45536 \
  --env NEX_TIMEOUT=30000 \
  -- npx -y @nexbrowser/mcp@latest
```

| 变量             | 是否必填 | 默认值                   | 说明                                      |
| ---------------- | -------- | ------------------------ | ----------------------------------------- |
| `NEX_API_HOST`   | 否       | `http://127.0.0.1:45536` | NexBrowser OpenAPI 基地址。               |
| `NEX_API_KEY`    | 是       | —                        | 由 NexBrowser OpenAPI 签发的 token。      |
| `NEX_TIMEOUT`    | 否       | `30000`                  | HTTP 请求超时，单位毫秒。                 |
| `NEX_EXPOSE_CDP` | 否       | 关闭                     | 仅在明确需要返回原始 CDP 地址时设为 `1`。 |

上述配置也可通过命令行参数传入——`--api-host`（`-H`）、`--api-key`（`-k`）、
`--timeout`（`-t`）和 `--expose-cdp`——命令行参数优先于环境变量。CLI 不会读取当前目录中的
`.env`；请通过 MCP 客户端配置传入可信环境变量。

建议使用 `NEX_API_KEY`，不要优先使用 `--api-key`：命令行中的密钥可能保留在 shell 历史中，
或被本机其他进程看到。

传输层使用 `Authorization: Bearer <api-key>` 携带 API 密钥，并通过 `X-Nex-Client-Id`
标识自动化会话归属；不再使用旧的自定义鉴权 Header。

## 常用工具

完整工具目录通过 MCP 的 `tools/list` 提供，常见工具包括：

- `nex_browser_list`、`nex_browser_open`、`nex_browser_close`、`nex_browser_connection_info`
- `nex_browser_connect`、`nex_browser_tab_list`、`nex_browser_snapshot`
- `nex_browser_click`、`nex_browser_fill_form`、`nex_browser_wait_for`
- `nex_browser_take_screenshot`、`nex_browser_console_messages`、`nex_browser_network_requests`

`nex_browser_connect` 要求提供 `windowId`。`teamId` 为可选参数：省略时由
NexBrowser Desktop 使用当前选中的团队。现有调用方仍可显式传入 `teamId`；
Desktop 应用会校验它与当前选中团队是否一致。

实际可用工具和高风险能力，最终仍受运行中的 NexBrowser Desktop 策略控制。

## Skill 包

仓库发布两个 Skill：

- `nexbrowser`：指导 Agent 完成 MCP 和配套 Skill 的完整配置。
- `nexbrowser-automation`：指导支持 Skill 的 Agent 选择工具、使用短期 snapshot ref，
  并从常见错误中恢复。

将下面这一条命令交给 Agent，即可安装配置入口 Skill：

```bash
npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser
```

Agent 重新加载 Skill 后，让它继续完成 NexBrowser 配置。该流程会注册 MCP，并安装
`nexbrowser-automation`。

如果只需直接安装自动化 Skill：

```bash
npx -y skills@latest add https://github.com/nex-browser/nexbrowser-mcp \
  --skill nexbrowser-automation
```

如需无交互地全局安装到 Codex：

```bash
npx -y skills@latest add https://github.com/nex-browser/nexbrowser-mcp \
  --skill nexbrowser-automation --agent codex --global --copy --yes
```

## 隐私与安全

MCP 工具结果对所配置的 MCP 客户端可见，也可能发送给其模型服务商。浏览器快照、截图、
console 输出、网络诊断、页面内容和可选的 CDP 连接信息均可能包含敏感数据。CDP 地址默认会
被隐藏，只有设置 `NEX_EXPOSE_CDP=1` 或传入 `--expose-cdp` 才会返回。请只使用可信客户端与
模型，不要公开分享执行记录，并仅在必要时启用 `nex_browser_evaluate`、`nex_browser_run_code` 和本地
文件访问。授权与文件访问策略最终由 NexBrowser Desktop 执行。

不要在共享环境中通过命令行传递 API Key。OpenAPI 服务应仅绑定可信网络接口；如果 Desktop
支持权限范围，应使用最小权限 Token。

## 以库方式嵌入

宿主程序可提供任意 MCP SDK transport 来嵌入服务：

```ts
import { NexBrowserMcpServer } from '@nexbrowser/mcp';

const server = new NexBrowserMcpServer({
  apiHost: 'http://127.0.0.1:45536',
  apiKey: process.env.NEX_API_KEY ?? '',
  timeout: 30_000
});

await server.connect(transport);
// 宿主退出时关闭服务。
await server.close();
```

## 开发与验证

仓库开发环境通过 `.nvmrc` 使用 Node.js 24.19.0；Node.js 22.13 或更高版本也可以开发，因为
这是钉死的 pnpm 11 工具链所要求的最低版本。发布包仍保持 Node.js 18 运行时下限。

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:package
pnpm inspect
```

项目还提供默认关闭的核心 Desktop E2E，依次执行连接 → 快照 → 零距离滚动 → 断开。请仅对
测试工作区中的专用窗口和 Token 运行：

```bash
NEX_E2E_ENABLED=1 NEX_E2E_WINDOW_ID=your-test-window NEX_API_KEY=your-test-key pnpm test:integration
```

`test` 直接对 TypeScript 源码运行 Vitest 测试；`build` 打包并向 `lib/` 输出 ESM 与
CommonJS 类型声明；`test:package` 还会校验构建后的 ESM、CommonJS、CLI、npm 包元数据和
消费者类型解析；`inspect` 会先构建，再用 MCP Inspector 打开构建产物中的 CLI
（`lib/cli.js`）。
