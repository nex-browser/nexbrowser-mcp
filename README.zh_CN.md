# NexBrowser MCP Server

现已支持 `nex_ip_*` 代理市场、续费与短效额度，`nex_mail_*` 邮箱申请与收信，`nex_captcha_*` 识别任务，以及 `nex_billing_trade_list` 账单核对。需要同时更新提供 `/ip`、`/mail`、`/captcha`、`/billing` 路由的 Desktop 客户端，并保持登录及现有服务端权限。

页面验证码优先保留 agent 已有的浏览器会话：先确认现有工具有权读取当前 HTML 并应用结果，再免费调用 `nex_captcha_detect({url, html, canApply: true})`。首批 HTML 检测支持 reCAPTCHA v2/enterprise 和 Turnstile，返回实际观察到的参数、在线契约及具体冲突；`canApply` 默认 false，不会授予执行权限。Desktop 固定捕获桥接改为可选增强，未捕获初始化不再单独阻断 agent 接入，但缺真实参数、契约不匹配或没有执行能力时仍不能付费。详见[选路与能力边界](skills/nexbrowser-automation/guides/captcha.md#choose-the-integration-workflow)。

付费识别统一走我们的 NexCaptcha：使用启用产品的精确 productCode、当前在线 Schema 和真实参数，通过 `nex_captcha_buy` 创建一次任务，再用返回的本地 id 调用 `nex_captcha_query`。agent 浏览器 Token 流程传入 `workflow: "BROWSER_RESULT"`，购买前仍检查线上流程和完整参数契约。免费 `nex_captcha_apply_result({id, url, websiteKey, selector?})` 只查询当前 MCP 进程购买的受支持 Token 任务，返回 `apply.javascript`，由 agent 在原页面/iframe 中使用已有权限执行；它不新建任务、不执行代码、不绕过浏览器权限。重启后应查询、核对原任务并使用明确的接入方式，不能为恢复绑定重购。价格、团队权限、记录、退款和账单继续由我们的服务管理。

可选固定桥接保留 `nex_browser_captcha_prepare` → `nex_browser_captcha_submit` → `nex_browser_captcha_complete`，用于已捕获控件和受支持 Grid，且不依赖任意脚本执行权限。首批 HTML 检测与生成回填只覆盖 reCAPTCHA v2/enterprise 和 Turnstile Token，不承诺通用 Cookie、hCaptcha 或任意图片交互；其他产品需在线契约加 agent 明确接入，或已有固定适配器。不得删除必需挑战参数、假设未声明的第三方字段，或因参数错误改用 Grid。独立任务仍可脱离浏览器使用产品/Schema/购买/查询工具。识别成功、网站验证通过和业务完成必须分别核对，详见[页面验证码流程](skills/nexbrowser-automation/guides/captcha.md)。

任务所需的购买、续费和短效提取直接执行，按服务端当前价格扣费，无需单独报价或付费确认。遵守用户的范围和限制；仅询问价格、库存或套餐不会下单。交互任务中短信等待 120 秒、验证邮件等待 180 秒；确认收不到、站点拒绝、代理不可用或打码失败后，可以自动更换兼容资源或新挑战并继续，每类恢复流程最多 3 次（含首次），切换国家、产品或邮箱域不重置次数。保留用户约束，核对记录与账单，并展示等待、失败、替换和结果。购买或回填结果未知时先停止新增扣费，余额不足立即停止付费操作。语言默认使用 Desktop 设置。详见[业务服务接入指南](skills/nexbrowser-automation/guides/services.md)。

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

修改配置后，请重启或重新加载 MCP 客户端，然后继续第 3 步。

### 3. 安装自动化 Skill（推荐）

MCP 提供工具，Skill 教 Claude Code、Codex、Cursor 等支持 Skill 的 Agent 用好这些工具：选对并连接环境、用页面快照引用操作元素而不是猜测选择器、从常见错误中恢复，并直接处理任务所需的验证码和扣费步骤。不装也能使用 MCP，但 Agent 更容易用错工具，在验证码和扣费流程上走弯路。

```bash
npx skills add https://github.com/nex-browser/nexbrowser-mcp --skill nexbrowser-automation
```

`latest` 与 `beta` 版本使用同一条命令。客户端的 API MCP 页面也会在配置下方给出这条命令。详见 [Skill 说明](skills/nexbrowser-automation/README.md)。

## 能力范围

- 环境管理：列出、启动、关闭和查看 NexBrowser 环境。
- 窗口分组：查看分组及各分组窗口数、创建/重命名/删除自建分组，以及把窗口移入或移出分组。
- 工作区代理与平台账号：列出、新建、修改、删除和检测代理；列出并编辑平台账号目录；把账号绑定到已关闭窗口。结果不返回任何密钥。
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
