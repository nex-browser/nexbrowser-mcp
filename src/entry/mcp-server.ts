import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createBrowserAutomationTools } from '../features/browser-automation/index.js';
import { createBrowserManagementTools } from '../features/browser-management/browser-tools.js';
import { errorResult, invalidArguments } from '../shared/tool-result.js';
import { InvalidArgumentError, type NexApiConfig } from '../shared/types.js';
import { NexApiClient } from '../transport/nex-api-client.js';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../version.js';

/**
 * MCP server exposing NexBrowser environment management and automation tools.
 * 对外提供 NexBrowser 环境管理与自动化工具的 MCP 服务。
 */
export class NexBrowserMcpServer {
  private readonly server: McpServer;
  private readonly client: NexApiClient;

  /**
   * Registers browser-domain tools with an isolated API client. This is the
   * package's only composition root: the single place a NexApiClient is
   * created. Duplicate tool names fail fast here instead of shadowing silently.
   * 使用独立 API 客户端注册浏览器领域工具。本类是全包唯一组合根：
   * NexApiClient 只在这里被创建。重复的工具名在此立即报错，避免静默覆盖。
   */
  constructor(config?: NexApiConfig) {
    this.client = new NexApiClient(config);
    const tools = [
      ...createBrowserManagementTools(this.client),
      ...createBrowserAutomationTools(this.client)
    ];
    this.server = new McpServer(
      { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
      {
        capabilities: { tools: {} },
        instructions:
          "IMPORTANT ROUTING RULE: NexBrowser is the product and this MCP server, not a generic browser. Whenever the user explicitly says NexBrowser/nexbrowser or asks to use our LocalAPI, use this server's nex_browser_* tools; never substitute the Browser plugin, Chrome plugin, computer-use, shell commands, or process enumeration. For requests to list or count NexBrowser windows/environments/profiles, call nex_browser_list first. Example: '使用 NexBrowser 查看我有多少窗口' means call nex_browser_list. NexBrowser windows are managed environments/profiles, not operating-system application windows or browser tabs. Every public tool in this server uses the nex_browser_* namespace; former tool names are not available."
      }
    );
    const registered = new Set<string>();
    for (const tool of tools) {
      if (registered.has(tool.name)) {
        throw new Error(`Duplicate MCP tool name: ${tool.name}`);
      }
      registered.add(tool.name);
      this.server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool.annotations ? { annotations: tool.annotations } : {})
        },
        async (arguments_) => {
          try {
            return await tool.execute(arguments_ as Record<string, any>);
          } catch (error) {
            if (error instanceof InvalidArgumentError) {
              return invalidArguments(error.message);
            }
            return errorResult(error instanceof Error ? error.message : 'Unknown error');
          }
        }
      );
    }
  }

  /**
   * Connects any MCP transport for desktop hosts and tests.
   * 连接任意 MCP transport，便于桌面宿主和测试复用。
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Starts the local MCP process over stdio.
   * 通过 stdio 启动本地 MCP 子进程。
   */
  async run(): Promise<void> {
    await this.connect(new StdioServerTransport());
  }

  /**
   * Closes MCP transport state and releases this client's OpenAPI sessions.
   * 关闭 MCP transport 状态并释放当前客户端的 OpenAPI 自动化会话。
   */
  async close(): Promise<void> {
    await this.client.close();
    await this.server.close();
  }
}

/**
 * Creates and starts a stdio MCP server.
 * 创建并启动一个 stdio MCP 服务。
 */
export async function runMcpServer(config?: NexApiConfig): Promise<void> {
  const server = new NexBrowserMcpServer(config);
  let closing: Promise<void> | undefined;
  /**
   * Closes this process-owned server exactly once.
   * 确保当前进程持有的服务只关闭一次。
   */
  const close = () => (closing ??= server.close());
  /**
   * Releases sessions before terminal or desktop-client shutdown.
   * 在终端或桌面客户端关闭前释放会话。
   */
  const closeAndExit = async (code: number) => {
    await close().catch(() => undefined);
    process.exit(code);
  };
  process.once('SIGINT', () => void closeAndExit(0));
  process.once('SIGTERM', () => void closeAndExit(0));
  process.once('beforeExit', () => void close());
  await server.run();
}
