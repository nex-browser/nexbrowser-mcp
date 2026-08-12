#!/usr/bin/env node

/**
 * CLI entry: parse Commander arguments, resolve CLI > environment > default
 * precedence, and start MCP with the explicit configuration.
 * 命令行入口：解析 Commander 参数，按 CLI > 环境变量 > 默认值解析配置，
 * 以显式配置启动 MCP 服务。
 */

import { Command } from 'commander';
import dotenv from 'dotenv';
import {
  DEFAULT_NEX_API_HOST,
  DEFAULT_NEX_TIMEOUT,
  NexConfigurationError,
  PKG_VERSION,
  resolveNexApiConfig,
  runServer
} from './index.js';

dotenv.config({ quiet: true });

const program = new Command();

program
  .name('nexbrowser-mcp')
  .description('NexBrowser MCP Server - Model Context Protocol server for NexBrowser automation')
  .version(PKG_VERSION, '-V, --version', 'Show version')
  .option(
    '-H, --api-host <url>',
    'NexBrowser API base URL',
    process.env.NEX_API_HOST ?? DEFAULT_NEX_API_HOST
  )
  .option(
    '-k, --api-key <key>',
    'API key (prefer NEX_API_KEY; command-line values may be visible to other processes)',
    process.env.NEX_API_KEY ?? ''
  )
  .option(
    '-t, --timeout <ms>',
    'Request timeout in milliseconds',
    (v: string) => (v != null && v !== '' ? Number.parseInt(v, 10) : DEFAULT_NEX_TIMEOUT),
    process.env.NEX_TIMEOUT != null ? Number(process.env.NEX_TIMEOUT) : DEFAULT_NEX_TIMEOUT
  )
  .option('--expose-cdp', 'Include raw CDP endpoints in management-tool results', false)
  .addHelpText(
    'after',
    `
Environment (used when option not passed):
  NEX_API_HOST   API base URL (default: ${DEFAULT_NEX_API_HOST})
  NEX_API_KEY    API key (required)
  NEX_TIMEOUT    Timeout in ms (default: ${DEFAULT_NEX_TIMEOUT})
  NEX_EXPOSE_CDP Set to 1 only when raw CDP endpoints are explicitly required

Examples:
  NEX_API_KEY=your-key nexbrowser-mcp
  NEX_API_KEY=your-key nexbrowser-mcp -H ${DEFAULT_NEX_API_HOST}
`
  );

/**
 * Parses CLI configuration and starts the stdio MCP server.
 * 解析命令行配置并启动 stdio MCP 服务。
 */
async function main(): Promise<void> {
  program.parse();

  const opts = program.opts<{
    apiHost: string;
    apiKey: string;
    timeout: number;
    exposeCdp: boolean;
  }>();
  const config = resolveNexApiConfig(process.env, {
    apiHost: opts.apiHost,
    apiKey: opts.apiKey,
    timeout: opts.timeout,
    exposeCdp: opts.exposeCdp || undefined
  });

  try {
    await runServer(config);
  } catch (error) {
    if (error instanceof NexConfigurationError) {
      console.error(`Configuration Error: ${error.message}`);
      process.exit(1);
    }
    console.error('Unexpected error:', error);
    process.exit(1);
  }
}

main();
