interface CaptchaApplicationTarget {
  url: string;
  websiteKey: string;
  productCode: string;
  selector?: string;
  challenge?: {
    s?: string;
    action?: string;
    data?: string;
    pagedata?: string;
    userAgent?: string;
  };
}

interface CaptchaApplicationInput extends CaptchaApplicationTarget {
  token: string;
}

/** 生成受当前页面及控件约束的回填表达式；不会执行脚本或提交业务表单。 */
export function buildCaptchaApplication(target: CaptchaApplicationTarget, token: string): string {
  const supported = [
    'RECAPTCHA_V2',
    'RECAPTCHA_V2_ENTERPRISE',
    'TURNSTILE',
    'CLOUDFLARE_TURNSTILE'
  ];
  if (!supported.includes(target.productCode))
    throw new Error('This CAPTCHA product has no supported token application recipe.');
  const url = new URL(target.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('CAPTCHA application requires an HTTP(S) page URL without credentials.');
  if (typeof target.websiteKey !== 'string' || !target.websiteKey.trim())
    throw new Error('CAPTCHA application requires an observed websiteKey.');
  if (typeof token !== 'string' || !token)
    throw new Error('CAPTCHA application requires a nonempty token.');
  if (target.selector !== undefined && (!target.selector.trim() || target.selector.length > 1_000))
    throw new Error('CAPTCHA application selector must be observed and at most 1000 characters.');
  if (
    target.challenge &&
    Object.entries(target.challenge).some(
      ([key, value]) =>
        !['s', 'action', 'data', 'pagedata', 'userAgent'].includes(key) ||
        typeof value !== 'string' ||
        !value
    )
  )
    throw new Error('CAPTCHA challenge bindings must contain supported nonempty observed strings.');
  const input: CaptchaApplicationInput = {
    url: url.href,
    websiteKey: target.websiteKey,
    productCode: target.productCode,
    ...(target.selector === undefined ? {} : { selector: target.selector }),
    ...(target.challenge === undefined ? {} : { challenge: { ...target.challenge } }),
    token
  };
  return `(${applyCaptchaToken.toString()})(${JSON.stringify(input)})`;
}

/** 页面函数必须自包含，供 agent 使用其已获授权的浏览器执行能力运行。 */
function applyCaptchaToken(input: CaptchaApplicationInput) {
  const root = (globalThis as any).window;
  const document = root.document;
  const location = root.location;
  const Element = root.Element;
  const expected = new URL(input.url);
  const current = new URL(location.href);
  expected.hash = current.hash = '';
  if (expected.href !== current.href)
    throw new Error('CAPTCHA page URL changed; do not apply this token.');

  const stateKey = '__nexAgentCaptchaApplicationsV1';
  const stateDescriptor = Object.getOwnPropertyDescriptor(root, stateKey);
  if (stateDescriptor && !('value' in stateDescriptor))
    throw new Error('CAPTCHA application state is unavailable.');
  const states: Map<string, any> = stateDescriptor?.value ?? new Map();
  if (!(states instanceof Map)) throw new Error('CAPTCHA application state is invalid.');
  const identity = JSON.stringify([
    expected.href,
    input.productCode,
    input.websiteKey,
    input.token
  ]);
  const previous = states.get(identity);
  if (previous)
    return previous.applied
      ? { ...previous, alreadyApplied: true }
      : {
          applied: false,
          alreadyAttempted: true,
          applicationOutcome: 'UNKNOWN',
          websiteVerified: false
        };

  /** 只读取自有数据属性，不执行 getter、代码字符串或供应商对象中的未知函数。 */
  const ownValue = (object: any, name: string) => {
    try {
      if (!object || !['object', 'function'].includes(typeof object)) return undefined;
      const property = Object.getOwnPropertyDescriptor(object, name);
      return property && 'value' in property ? property.value : undefined;
    } catch {
      return undefined;
    }
  };
  /** 命名回调只解析标识符路径，保留站点方法所属对象。 */
  const namedCallback = (name: unknown) => {
    if (typeof name !== 'string' || !/^[\w$]+(?:\.[\w$]+)*$/.test(name)) return undefined;
    const parts = name.split('.');
    if (parts.some((part) => ['__proto__', 'prototype', 'constructor'].includes(part)))
      return undefined;
    let owner = root;
    for (const part of parts.slice(0, -1)) owner = ownValue(owner, part);
    const callback = ownValue(owner, parts[parts.length - 1]!);
    return typeof callback === 'function' ? { callback, owner } : undefined;
  };

  const recaptcha = input.productCode.startsWith('RECAPTCHA_');
  const enterprise = input.productCode === 'RECAPTCHA_V2_ENTERPRISE';
  const fieldName = recaptcha ? 'g-recaptcha-response' : 'cf-turnstile-response';
  const fieldSelector = `textarea[name="${fieldName}"],input[name="${fieldName}"]`;
  const widgets = new Map<any, { frame?: any; anchors: number }>();
  if (recaptcha) {
    for (const frame of document.querySelectorAll('iframe[src]')) {
      let url: URL;
      try {
        url = new URL(frame.getAttribute('src') ?? '', location.href);
      } catch {
        continue;
      }
      if (
        ![
          'www.google.com',
          'google.com',
          'www.recaptcha.net',
          'recaptcha.net',
          'recaptcha.google.com'
        ].includes(url.hostname) ||
        url.pathname !== `/recaptcha/${enterprise ? 'enterprise' : 'api2'}/anchor` ||
        url.searchParams.get('k') !== input.websiteKey
      )
        continue;
      let container: any = frame.closest('.g-recaptcha') ?? frame.parentElement ?? frame;
      if (!frame.closest('.g-recaptcha')) {
        for (let depth = 0; depth < 4; depth++) {
          if (container.matches('body,html,form')) {
            container = frame;
            break;
          }
          if (container.querySelectorAll('iframe[src*="/anchor"]').length !== 1) break;
          if (container.querySelector(fieldSelector)) break;
          const parent = container.parentElement;
          if (!parent || parent.matches('body,html,form')) break;
          container = parent;
        }
      }
      const key = container.getAttribute('data-sitekey');
      if (key && key !== input.websiteKey)
        throw new Error('CAPTCHA container sitekey does not match its anchor.');
      const existing = widgets.get(container);
      widgets.set(container, { frame, anchors: (existing?.anchors ?? 0) + 1 });
    }
  } else {
    for (const container of document.querySelectorAll('.cf-turnstile,[data-sitekey]')) {
      if (container.getAttribute('data-sitekey') !== input.websiteKey) continue;
      if (!container.matches('.cf-turnstile') && !container.querySelector(fieldSelector)) continue;
      widgets.set(container, { anchors: 0 });
    }
  }

  let choices = [...widgets.entries()];
  if (input.selector) {
    let nodes: any[];
    try {
      nodes = [...document.querySelectorAll(input.selector)];
    } catch {
      throw new Error('CAPTCHA selector is invalid.');
    }
    if (nodes.length !== 1) throw new Error('CAPTCHA selector must identify one current element.');
    const selected = nodes[0]!;
    choices = choices.filter(
      ([container]) =>
        container === selected || container.contains(selected) || selected.contains(container)
    );
  }
  if (choices.length !== 1)
    throw new Error(
      'CAPTCHA widget is missing, changed or ambiguous; select the observed current widget.'
    );
  const [container, widget] = choices[0]!;
  if (!container.isConnected || (recaptcha && widget.anchors !== 1))
    throw new Error('CAPTCHA widget changed or contains multiple anchors.');
  const fields = [...container.querySelectorAll(fieldSelector)];
  if (fields.length > 1) throw new Error('CAPTCHA response field association is ambiguous.');

  const callbacks: Array<{ callback: (...args: any[]) => any; owner: any }> = [];
  const observations: Record<string, unknown[]> = { s: [], action: [], data: [], pagedata: [] };
  /** 仅保留与当前控件关联的挑战输入，缺失值不假装成已验证的空字符串。 */
  const observe = (name: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') observations[name]!.push(value);
  };
  observe('s', container.getAttribute('data-s'));
  observe('action', container.getAttribute('data-action'));
  if (recaptcha && widget.frame) {
    const anchor = new URL(widget.frame.getAttribute('src') ?? '', location.href);
    observe('s', anchor.searchParams.get('s'));
  } else {
    observe('data', container.getAttribute('data-cdata'));
    observe('pagedata', container.getAttribute('data-chlpagedata'));
  }
  const declared = namedCallback(container.getAttribute('data-callback'));
  if (declared) callbacks.push(declared);
  if (recaptcha) {
    const id = fields[0]?.id.match(/^g-recaptcha-response(?:-(\d+))?$/);
    const uniqueId = id && document.querySelectorAll(`[id="${fields[0]!.id}"]`).length === 1;
    const widgetId = id ? Number(id[1] ?? 0) : undefined;
    const registry = ownValue(root, '___grecaptcha_cfg');
    const clients = ownValue(registry, 'clients');
    let clientIds: string[] = [];
    try {
      clientIds = Object.keys(clients ?? {}).slice(0, 100);
    } catch {
      /* 不透明注册表不作为回调来源。 */
    }
    for (const clientId of clientIds) {
      if (!/^\d+$/.test(clientId)) continue;
      const queue = [{ value: ownValue(clients, clientId), depth: 0 }];
      const seen = new WeakSet<object>();
      const found: Array<{ callback: (...args: any[]) => any; owner: any }> = [];
      const foundInputs: Array<{ s: unknown; action: unknown }> = [];
      let referencesWidget = false;
      for (let cursor = 0; cursor < queue.length && cursor < 500; cursor++) {
        const { value, depth } = queue[cursor]!;
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        if (value === container || value === widget.frame) referencesWidget = true;
        if (value instanceof Element || value === root || value === document || depth > 7) continue;
        if (ownValue(value, 'sitekey') === input.websiteKey) {
          foundInputs.push({ s: ownValue(value, 's'), action: ownValue(value, 'action') });
          const callback = ownValue(value, 'callback');
          const resolved =
            typeof callback === 'function' ? { callback, owner: value } : namedCallback(callback);
          if (resolved) found.push(resolved);
        }
        let keys: string[] = [];
        try {
          keys = Object.keys(value).slice(0, 100);
        } catch {
          continue;
        }
        for (const key of keys) {
          const child = ownValue(value, key);
          if (child && typeof child === 'object' && queue.length < 500)
            queue.push({ value: child, depth: depth + 1 });
        }
      }
      if ((uniqueId && Number(clientId) === widgetId) || referencesWidget) {
        if (!declared) callbacks.push(...found);
        for (const fields of foundInputs) {
          observe('s', fields.s);
          observe('action', fields.action);
        }
      }
    }
  }
  const uniqueCallbacks = callbacks.filter(
    (entry, index) =>
      callbacks.findIndex(
        (other) => other.callback === entry.callback && other.owner === entry.owner
      ) === index
  );
  if (uniqueCallbacks.length > 1) throw new Error('CAPTCHA callback association is ambiguous.');
  if (!fields.length && !uniqueCallbacks.length)
    throw new Error('No scoped CAPTCHA response field or associated callback is available.');

  // URL 和 sitekey 不会随每次刷新改变；付费任务中的挑战输入也必须仍能逐项核实。
  for (const name of ['s', 'action', 'data', 'pagedata'] as const) {
    const expected = input.challenge?.[name];
    const values = observations[name]!;
    if (values.some((value) => typeof value !== 'string') || new Set(values).size > 1)
      throw new Error(`Current CAPTCHA ${name} sources conflict; do not apply this token.`);
    if (
      expected !== undefined &&
      (values.length === 0 || values.some((value) => value !== expected))
    )
      throw new Error(`Current CAPTCHA ${name} is missing or changed; do not apply this token.`);
    if (
      expected === undefined &&
      values.length > 0 &&
      !(name === 's' && input.productCode === 'RECAPTCHA_V2_ENTERPRISE')
    )
      throw new Error(
        `Current CAPTCHA ${name} was not bound to this task; do not apply this token.`
      );
  }
  if (
    input.challenge?.userAgent !== undefined &&
    root.navigator?.userAgent !== input.challenge.userAgent
  )
    throw new Error(
      'CAPTCHA browser User-Agent changed or is unavailable; do not apply this token.'
    );

  if (!stateDescriptor)
    Object.defineProperty(root, stateKey, {
      value: states,
      configurable: false,
      enumerable: false,
      writable: false
    });
  // 回调和事件均可能同步触发站点请求；在任何写入之前锁定，异常后也不重放。
  states.set(identity, { applied: false, websiteVerified: false });
  for (const field of fields) {
    field.value = input.token;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const callback = uniqueCallbacks[0];
  if (callback) callback.callback.call(callback.owner, input.token);
  const result = {
    applied: true,
    websiteVerified: false,
    method: callback ? 'callback' : 'set',
    responseFieldCount: fields.length
  };
  states.set(identity, result);
  return result;
}
