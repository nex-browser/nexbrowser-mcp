import { describe, expect, it, vi } from 'vitest';
import { createSmsTools, TOOLS, type NexApiClient } from '../src/index.js';

function toolWith(name: string, ...responses: unknown[]) {
  const queue = [...responses];
  const request = vi.fn(async () => queue.shift() ?? { code: 0, msg: 'ok', data: null });
  const client = { request, getActiveSessionId: () => undefined } as unknown as NexApiClient;
  const tool = createSmsTools(client).find((candidate) => candidate.name === name)!;
  expect(tool, `Expected tool ${name} to be registered`).toBeDefined();
  return { request, tool };
}

const text = (result: { content: unknown[] }) =>
  String((result.content[0] as { text: string }).text);

const ok = (data: unknown) => ({ code: 0, msg: 'ok', data });

describe('nex_sms_project_list', () => {
  it('quotes the discounted unit price and stock', async () => {
    const { request, tool } = toolWith(
      'nex_sms_project_list',
      ok([{ projectId: 101, projectName: 'Telegram', available: 3, price: 2, discountPrice: 1.5 }])
    );

    const result = await tool.execute({ countryId: 6 });

    expect(request).toHaveBeenLastCalledWith(
      '/sms/stocks?countryId=6',
      expect.objectContaining({ method: 'GET' })
    );
    expect(text(result)).toContain('Price: 1.5 | Stock: 3');
  });
});

describe('nex_sms_buy', () => {
  it('pins reconciliation to the purchase context and discards mismatched candidates', async () => {
    const { tool, request } = toolWith(
      'nex_sms_buy',
      { ...ok(null), contextId: 'team-a' },
      { ...ok({ data: [{ countryId: 6, projectId: 101, tel: '+15550001' }] }), contextId: 'team-b' }
    );
    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });
    expect(request).toHaveBeenLastCalledWith(
      '/sms/records?page=1&size=100',
      expect.objectContaining({ headers: { 'X-Nex-Service-Context': 'team-a' } })
    );
    expect(result.structuredContent).toMatchObject({
      recordsRefreshed: false,
      candidateRecords: []
    });
  });
  it('does not automatically retry a lost purchase response', async () => {
    const { tool, request } = toolWith('nex_sms_buy');
    request.mockRejectedValueOnce(new Error('timeout'));
    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('outcome is unknown');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reconciles an empty allocation array rather than claiming requested numbers were delivered', async () => {
    const { tool } = toolWith('nex_sms_buy', ok([]), ok({ count: 0, total: 0, data: [] }));
    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });
    expect(result.structuredContent).toMatchObject({
      deliveryConfirmed: false,
      candidateRecords: []
    });
  });
  it('refreshes records after null success without claiming historical numbers were just bought', async () => {
    const { tool, request } = toolWith(
      'nex_sms_buy',
      ok(null),
      ok({
        count: 30,
        total: 2,
        data: [
          { countryId: 6, projectId: 101, tel: '+15550001' },
          { countryId: 7, projectId: 101, tel: '+15550002' }
        ]
      })
    );
    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.structuredContent).toMatchObject({
      deliveryConfirmed: false,
      recordsRefreshed: true,
      candidateRecords: [{ tel: '+15550001' }]
    });
    expect(text(result)).toContain('may include older purchases');
  });

  it('does not turn failed reconciliation into a failed purchase or repeat the buy', async () => {
    const { tool, request } = toolWith('nex_sms_buy', ok(null), {
      code: -1209,
      msg: 'Login expired'
    });
    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      recordsRefreshed: false,
      deliveryConfirmed: false
    });
    expect(request.mock.calls).toHaveLength(2);
  });
  it('forwards the price ceiling with the order', async () => {
    const { request, tool } = toolWith(
      'nex_sms_buy',
      ok([{ tel: '+15550001', projectName: 'Telegram', state: 0 }])
    );

    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });

    expect(request).toHaveBeenLastCalledWith(
      '/sms/buy',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ countryId: 6, projectId: 101, quantity: 1, maxTotalPrice: 2 })
      })
    );
    expect(text(result)).toContain('+15550001');
  });

  it('requires maxTotalPrice and caps quantity', async () => {
    const { request, tool } = toolWith('nex_sms_buy');
    expect(() => tool.execute({ countryId: 6, projectId: 101 })).toThrow();
    expect(() =>
      tool.execute({ countryId: 6, projectId: 101, quantity: 11, maxTotalPrice: 100 })
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it('surfaces a refused order as an error', async () => {
    const { tool } = toolWith('nex_sms_buy', {
      code: 1,
      msg: 'total price 3 exceeds maxTotalPrice 2',
      data: null
    });
    const result = await tool.execute({ countryId: 6, projectId: 101, maxTotalPrice: 2 });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('exceeds maxTotalPrice');
  });
});

describe('nex_sms_record_list', () => {
  it('uses count for records instead of total pages', async () => {
    const { tool } = toolWith('nex_sms_record_list', ok({ count: 42, total: 3, data: [] }));
    expect((await tool.execute({})).structuredContent).toMatchObject({ total: 42, totalPages: 3 });
  });
  it('returns a message count instead of full SMS bodies', async () => {
    const message = JSON.stringify([{ code: '1111', sms: 'Your code is 1111' }]);
    const { request, tool } = toolWith(
      'nex_sms_record_list',
      ok({ rows: [{ tel: '+15550001', state: 1, message }], total: 1 })
    );

    const result = await tool.execute({ keyword: ' tg ' });

    expect(request).toHaveBeenLastCalledWith(
      '/sms/records?page=1&size=20&keyword=tg',
      expect.objectContaining({ method: 'GET' })
    );
    const row = (result.structuredContent?.rows as Record<string, unknown>[])[0];
    expect(row).toMatchObject({ tel: '+15550001', code: '1111', messageCount: 1 });
    expect(row).not.toHaveProperty('messages');
  });
});

describe('nex_sms_code_get', () => {
  it('pins subsequent polls to the initial team and stops on a context change', async () => {
    vi.useFakeTimers();
    try {
      const { tool, request } = toolWith(
        'nex_sms_code_get',
        { ...ok({ state: 0 }), contextId: 'team-a' },
        { code: 'SESSION_CONTEXT_CHANGED', msg: 'Return to original team', data: null }
      );
      const result = tool.execute({ tel: '+15550001', waitSeconds: 30 });
      await vi.advanceTimersByTimeAsync(5000);
      expect((await result).isError).toBe(true);
      expect(request).toHaveBeenLastCalledWith(
        '/sms/pull',
        expect.objectContaining({ headers: { 'X-Nex-Service-Context': 'team-a' } })
      );
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
  it('extracts the code from the double-encoded message field', async () => {
    const message = JSON.stringify(
      JSON.stringify([
        { code: '482913', sms: 'Your code is 482913', smsTime: '2026-10-14 10:00:00' }
      ])
    );
    const { request, tool } = toolWith(
      'nex_sms_code_get',
      ok({ tel: '+15550001', state: 1, message })
    );

    const result = await tool.execute({ tel: ' +15550001 ' });

    expect(request).toHaveBeenLastCalledWith(
      '/sms/pull',
      expect.objectContaining({ body: JSON.stringify({ tel: '+15550001' }) })
    );
    expect(text(result)).toContain('**482913**');
    expect(result.structuredContent?.record).toMatchObject({ code: '482913', state: 1 });
  });

  it('polls until a code arrives when waitSeconds is set', async () => {
    vi.useFakeTimers();
    try {
      const { request, tool } = toolWith(
        'nex_sms_code_get',
        ok({ tel: '+15550001', state: 0 }),
        ok({ tel: '+15550001', state: 1, message: JSON.stringify([{ code: '1111' }]) })
      );
      const pending = tool.execute({ tel: '+15550001', waitSeconds: 30 });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(text(await pending)).toContain('1111');
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('suggests a refund when still waiting without wait time', async () => {
    const { tool } = toolWith('nex_sms_code_get', ok({ tel: '+15550001', state: 0 }));
    expect(text(await tool.execute({ tel: '+15550001' }))).toContain('nex_sms_release');
  });
});

describe('nex_sms_code_fill', () => {
  const withCode = (code: string, state = 1) =>
    ok({
      tel: '+15550001',
      state,
      message: JSON.stringify([{ code, smsTime: '2026-10-14 10:00:00' }])
    });

  it('fills the code into the session target without echoing it', async () => {
    const { request, tool } = toolWith('nex_sms_code_fill', withCode('482913'), ok({}));

    const result = await tool.execute({ sessionId: 's1', tel: '+15550001', target: 'e12' });

    expect(request).toHaveBeenLastCalledWith(
      '/automation/sessions/s1/actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'fill', params: { target: 'e12', value: '482913' } })
      })
    );
    expect(text(result)).not.toContain('482913');
    expect(JSON.stringify(result.structuredContent)).not.toContain('482913');
  });

  it('presses Enter when submit is set', async () => {
    const { request, tool } = toolWith('nex_sms_code_fill', withCode('1111'), ok({}), ok({}));

    await tool.execute({ sessionId: 's1', tel: '+15550001', target: 'e12', submit: true });

    expect(request).toHaveBeenLastCalledWith(
      '/automation/sessions/s1/actions',
      expect.objectContaining({
        body: JSON.stringify({ action: 'press', params: { target: 'e12', key: 'Enter' } })
      })
    );
  });

  it('waits for a different code when onlyNew is set', async () => {
    vi.useFakeTimers();
    try {
      const { request, tool } = toolWith(
        'nex_sms_code_fill',
        withCode('1111'),
        withCode('2222'),
        ok({})
      );
      const pending = tool.execute({
        sessionId: 's1',
        tel: '+15550001',
        target: 'e12',
        onlyNew: true,
        waitSeconds: 30
      });
      await vi.advanceTimersByTimeAsync(5_000);
      await pending;
      expect(request).toHaveBeenLastCalledWith(
        '/automation/sessions/s1/actions',
        expect.objectContaining({
          body: JSON.stringify({ action: 'fill', params: { target: 'e12', value: '2222' } })
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('fills nothing when the number expired without a code', async () => {
    const { request, tool } = toolWith('nex_sms_code_fill', ok({ tel: '+15550001', state: 2 }));

    const result = await tool.execute({ sessionId: 's1', tel: '+15550001', target: 'e12' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: 'SMS_CODE_TIMEOUT' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('nex_sms_release', () => {
  it.each([null, { tel: '+15550001', state: 0 }])(
    'does not claim a refund from null or stale state',
    async (data) => {
      const { tool } = toolWith('nex_sms_release', ok(data));
      const result = await tool.execute({ tel: '+15550001', reason: 'no_code' });
      expect(result.structuredContent?.refundConfirmed).toBe(false);
      expect(text(result)).not.toContain('Released');
      expect(text(result)).toContain('confirm the final state');
    }
  );
  it('rejects unknown reasons and forwards valid ones', async () => {
    const { request, tool } = toolWith('nex_sms_release', ok({ tel: '+15550001', state: -1 }));
    expect(() => tool.execute({ tel: '+15550001', reason: 'bored' })).toThrow();
    const result = await tool.execute({ tel: '+15550001', reason: 'no_code' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(text(result)).toContain('refunded');
  });
});

describe('sms tool safety metadata', () => {
  it('marks charging and releasing as destructive', () => {
    for (const name of ['nex_sms_buy', 'nex_sms_release']) {
      expect(TOOLS.find((tool) => tool.name === name)?.annotations?.destructiveHint, name).toBe(
        true
      );
    }
  });
});
