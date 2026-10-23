import { describe, expect, it, vi } from 'vitest';
import { createIpTools, type NexApiClient } from '../src/index.js';

/** 测试真实付费工具输出，禁止访问任何实际扣费服务。 */
function purchaseTool(response: unknown, rejects = false) {
  const request = rejects
    ? vi.fn().mockRejectedValue(new Error('response lost'))
    : vi.fn().mockResolvedValue(response);
  const client = { request } as unknown as NexApiClient;
  return {
    request,
    tool: createIpTools(client).find((candidate) => candidate.name === 'nex_ip_buy')!
  };
}

describe('paid service failure guidance', () => {
  it('reports insufficient balance without unknown-outcome or retry guidance', async () => {
    const { tool, request } = purchaseTool({ code: -1208, msg: '余额不足', data: null });
    const result = await tool.execute({ productId: 'p', quantity: 1, duration: 1 });

    expect(request).toHaveBeenCalledTimes(1);
    expect(result.structuredContent).toMatchObject({
      code: -1208,
      message: '余额不足',
      billingBlocked: true,
      retryable: false,
      stopPaidOperations: true
    });
    expect(result.structuredContent).not.toHaveProperty('recovery');
    expect(JSON.stringify(result)).not.toContain('outcome is unknown');
    expect(JSON.stringify(result)).not.toContain('Refresh nex_ip_order_list');
  });

  it.each([
    { code: 0, msg: 'ok', data: null },
    { code: -1, msg: 'Failure with possible partial delivery', data: null },
    'transport-failure'
  ])(
    'requires reconciliation after unconfirmed allocation without a second purchase: %j',
    async (response) => {
      const { tool, request } = purchaseTool(response, response === 'transport-failure');
      const result = await tool.execute({ productId: 'p', quantity: 1, duration: 1 });

      expect(request).toHaveBeenCalledTimes(1);
      expect(result.structuredContent?.recovery).toMatchObject({
        resourceType: 'proxy',
        action: 'RECONCILE',
        retryable: false,
        maxAttempts: 3
      });
      const jsonText = result.content.at(-1);
      expect(jsonText?.type).toBe('text');
      expect(jsonText?.type === 'text' && JSON.parse(jsonText.text)).toEqual(
        result.structuredContent
      );
    }
  );
});
