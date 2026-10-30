import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { buildCaptchaApplication } from '../src/features/captcha/agent-captcha-application.js';

/** 仅实现测试所需的公开 DOM 行为，页面脚本仍通过真正的 VM 序列化路径运行。 */
class FixtureElement {
  children: FixtureElement[] = [];
  parentElement?: FixtureElement;
  value = '';
  events: string[] = [];
  onDispatch?: () => void;
  constructor(
    readonly tagName: string,
    readonly attributes: Record<string, string> = {}
  ) {}
  get id() {
    return this.attributes.id ?? '';
  }
  get isConnected(): boolean {
    return this.tagName === '#document' || Boolean(this.parentElement?.isConnected);
  }
  append(...children: FixtureElement[]) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
  matches(selector: string): boolean {
    return selector.split(',').some((part) => {
      if (part.startsWith('#')) return this.id === part.slice(1);
      if (part.startsWith('.'))
        return (this.attributes.class ?? '').split(/\s+/).includes(part.slice(1));
      const match = part.match(/^(\w+)?(?:\[([\w-]+)(\*?=)?"?([^\]"]*)"?\])?$/);
      if (!match) throw new Error('Invalid fixture selector');
      if (match[1] && this.tagName !== match[1]) return false;
      if (!match[2]) return Boolean(match[1]);
      const value = this.getAttribute(match[2]);
      return match[3] === '*='
        ? value?.includes(match[4]!) === true
        : match[3] === '='
          ? value === match[4]
          : value !== null;
    });
  }
  querySelectorAll(selector: string): FixtureElement[] {
    if (selector === '[') throw new Error('Invalid selector');
    const all = this.children.flatMap((child) => [child, ...child.descendants()]);
    return all.filter((element) => element.matches(selector));
  }
  descendants(): FixtureElement[] {
    return this.children.flatMap((child) => [child, ...child.descendants()]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector: string): FixtureElement | null {
    return this.matches(selector) ? this : (this.parentElement?.closest(selector) ?? null);
  }
  contains(element: FixtureElement): boolean {
    return this === element || this.children.some((child) => child.contains(element));
  }
  dispatchEvent(event: Event) {
    this.events.push(event.type);
    this.onDispatch?.();
    return true;
  }
}

/** 创建独立文档，覆盖真实表达式的作用域、JSON 转义与副作用边界。 */
function fixture() {
  const document = new FixtureElement('#document');
  const html = new FixtureElement('html');
  const body = new FixtureElement('body');
  const form = Object.assign(new FixtureElement('form'), { submit: vi.fn() });
  const email = new FixtureElement('input', { name: 'email' });
  email.value = 'preserve@example.test';
  document.append(html);
  html.append(body);
  body.append(form);
  form.append(email);
  const root: any = {
    document,
    location: { href: 'https://site.test/login?step=2' },
    URL,
    Event,
    Element: FixtureElement
  };
  root.window = root;
  Object.assign(document, { body, documentElement: html });
  const context = vm.createContext(root);
  const run = (expression: string) => vm.runInContext(expression, context);
  const target = (productCode = 'RECAPTCHA_V2', selector?: string) => ({
    url: 'https://site.test/login?step=2',
    websiteKey: 'observed-key',
    productCode,
    ...(selector === undefined ? {} : { selector })
  });
  const widget = (productCode = 'RECAPTCHA_V2', id = 0, field = true) => {
    const recaptcha = productCode.startsWith('RECAPTCHA_');
    const container = new FixtureElement('div', {
      class: recaptcha ? 'g-recaptcha' : 'cf-turnstile',
      'data-sitekey': 'observed-key',
      id: `widget-${id}`
    });
    const response = new FixtureElement(recaptcha ? 'textarea' : 'input', {
      name: recaptcha ? 'g-recaptcha-response' : 'cf-turnstile-response',
      id: `g-recaptcha-response${id ? `-${id}` : ''}`
    });
    const frame = new FixtureElement('iframe', {
      src: `https://www.google.com/recaptcha/${productCode === 'RECAPTCHA_V2_ENTERPRISE' ? 'enterprise' : 'api2'}/anchor?k=observed-key`
    });
    if (recaptcha) container.append(frame);
    if (field) container.append(response);
    form.append(container);
    return { container, frame, response };
  };
  return { root, document, form, email, run, target, widget };
}

describe('agent CAPTCHA application recipe', () => {
  it.each(['RECAPTCHA_V2', 'RECAPTCHA_V2_ENTERPRISE', 'CLOUDFLARE_TURNSTILE', 'TURNSTILE'])(
    'fills a scoped %s response field without requiring initialization capture',
    (productCode) => {
      const f = fixture();
      const expression = buildCaptchaApplication(f.target(productCode), 'result-token');
      const { response } = f.widget(productCode);
      expect(f.run(expression)).toMatchObject({
        applied: true,
        websiteVerified: false,
        method: 'set',
        responseFieldCount: 1
      });
      expect(response.value).toBe('result-token');
      expect(response.events).toEqual(['input', 'change']);
      expect(f.form.submit).not.toHaveBeenCalled();
      expect(f.email.value).toBe('preserve@example.test');
      expect(f.run(expression)).toMatchObject({ applied: true, alreadyApplied: true });
      expect(response.events).toHaveLength(2);
    }
  );

  it('invokes an observed named callback with its original receiver after updating the field', () => {
    const f = fixture();
    const { container, response } = f.widget('CLOUDFLARE_TURNSTILE');
    const callback = vi.fn(function (this: any, token: string) {
      expect(this).toBe(f.root.site);
      expect(response.value).toBe(token);
    });
    f.root.site = { done: callback };
    container.attributes['data-callback'] = 'site.done';
    expect(
      f.run(buildCaptchaApplication(f.target('CLOUDFLARE_TURNSTILE'), 'answer'))
    ).toMatchObject({ method: 'callback' });
    expect(callback).toHaveBeenCalledWith('answer');
  });

  it('recovers the matching initialized reCAPTCHA callback without traversing getters', () => {
    const f = fixture();
    f.widget('RECAPTCHA_V2_ENTERPRISE', 3);
    const callback = vi.fn(function (this: any) {
      expect(this.sitekey).toBe('observed-key');
    });
    const config = { sitekey: 'observed-key', callback };
    const client: any = { nested: config };
    client.circular = client;
    const getter = vi.fn(() => {
      throw new Error('Private getter');
    });
    Object.defineProperty(client, 'private', { enumerable: true, get: getter });
    f.root.___grecaptcha_cfg = {
      clients: { 3: client, 8: { nested: { sitekey: 'observed-key', callback: vi.fn() } } }
    };
    expect(
      f.run(buildCaptchaApplication(f.target('RECAPTCHA_V2_ENTERPRISE'), 'answer'))
    ).toMatchObject({ method: 'callback' });
    expect(callback).toHaveBeenCalledWith('answer');
    expect(getter).not.toHaveBeenCalled();
  });

  it('requires a current observed selector when several matching widgets exist', () => {
    const f = fixture();
    const first = f.widget();
    const second = f.widget('RECAPTCHA_V2', 2);
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('ambiguous');
    expect(first.response.value).toBe('');
    expect(second.response.value).toBe('');
    expect(
      f.run(buildCaptchaApplication(f.target('RECAPTCHA_V2', '#widget-2'), 'answer'))
    ).toMatchObject({ applied: true });
    expect(first.response.value).toBe('');
    expect(second.response.value).toBe('answer');
  });

  it('locates the minimal anonymous widget container without writing other form fields', () => {
    const f = fixture();
    const { container, frame, response } = f.widget();
    delete container.attributes.class;
    delete container.attributes['data-sitekey'];
    container.children.splice(container.children.indexOf(frame), 1);
    const inner = new FixtureElement('div');
    container.append(inner);
    inner.append(frame);
    expect(f.run(buildCaptchaApplication(f.target(), 'anonymous'))).toMatchObject({
      applied: true,
      method: 'set'
    });
    expect(response.value).toBe('anonymous');
    expect(f.email.value).toBe('preserve@example.test');
  });

  it('allows callback-only widgets when a current declared callback is unambiguous', () => {
    const f = fixture();
    const { container } = f.widget('TURNSTILE', 0, false);
    const callback = vi.fn();
    f.root.done = callback;
    container.attributes['data-callback'] = 'done';
    expect(f.run(buildCaptchaApplication(f.target('TURNSTILE'), 'callback-only'))).toMatchObject({
      applied: true,
      method: 'callback',
      responseFieldCount: 0
    });
    expect(callback).toHaveBeenCalledWith('callback-only');
    expect(f.form.submit).not.toHaveBeenCalled();
  });

  it.each([
    'https://other.test/login?step=2',
    'https://site.test/login?step=3',
    'https://site.test/elsewhere'
  ])('rejects a changed page URL before writing: %s', (url) => {
    const f = fixture();
    const { response } = f.widget();
    f.root.location.href = url;
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('URL changed');
    expect(response.value).toBe('');
  });

  it('ignores only URL fragments and still binds the actual sitekey and enterprise variant', () => {
    const f = fixture();
    const { frame, response } = f.widget();
    f.root.location.href += '#same-document';
    expect(() =>
      f.run(buildCaptchaApplication(f.target('RECAPTCHA_V2_ENTERPRISE'), 'answer'))
    ).toThrow('missing, changed');
    frame.attributes.src = frame.attributes.src!.replace('observed-key', 'changed-key');
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('missing, changed');
    expect(response.value).toBe('');
    frame.attributes.src = frame.attributes.src!.replace('changed-key', 'observed-key');
    expect(f.run(buildCaptchaApplication(f.target(), 'answer'))).toMatchObject({ applied: true });
  });

  it('rejects a spoofed provider URL or mismatched container key', () => {
    const f = fixture();
    const { frame, container, response } = f.widget();
    frame.attributes.src = frame.attributes.src!.replace(
      'www.google.com',
      'www.google.com.evil.test'
    );
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('missing, changed');
    frame.attributes.src = frame.attributes.src!.replace(
      'www.google.com.evil.test',
      'www.google.com'
    );
    container.attributes['data-sitekey'] = 'other-key';
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('sitekey');
    expect(response.value).toBe('');
  });

  it('rejects multiple anchors or response fields before any write', () => {
    const f = fixture();
    const { container, frame, response } = f.widget();
    container.append(new FixtureElement('iframe', { ...frame.attributes }));
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('multiple anchors');
    container.children.pop();
    container.append(new FixtureElement('textarea', { name: 'g-recaptcha-response' }));
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow('field association');
    expect(response.value).toBe('');
  });

  it('does not resolve executable strings or getter-based named callbacks', () => {
    const f = fixture();
    const { container } = f.widget('TURNSTILE', 0, false);
    const getter = vi.fn(() => vi.fn());
    Object.defineProperty(f.root, 'badCallback', { get: getter });
    container.attributes['data-callback'] = 'badCallback';
    expect(() => f.run(buildCaptchaApplication(f.target('TURNSTILE'), 'answer'))).toThrow(
      'No scoped'
    );
    expect(getter).not.toHaveBeenCalled();
    container.attributes['data-callback'] = 'window.constructor.constructor';
    expect(() => f.run(buildCaptchaApplication(f.target('TURNSTILE'), 'answer'))).toThrow(
      'No scoped'
    );
  });

  it('does not choose between ambiguous registry callbacks even if a response field exists', () => {
    const f = fixture();
    const { response } = f.widget();
    const first = vi.fn();
    const second = vi.fn();
    f.root.___grecaptcha_cfg = {
      clients: {
        0: {
          a: { sitekey: 'observed-key', callback: first },
          b: { sitekey: 'observed-key', callback: second }
        }
      }
    };
    expect(() => f.run(buildCaptchaApplication(f.target(), 'answer'))).toThrow(
      'callback association'
    );
    expect(response.value).toBe('');
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('serializes hostile token strings as data rather than source code', () => {
    const f = fixture();
    const { response } = f.widget();
    const token = '\'); window.hacked = true; //"\\\n</script>\u2028\u2029';
    expect(f.run(buildCaptchaApplication(f.target(), token))).toMatchObject({ applied: true });
    expect(response.value).toBe(token);
    expect(f.root.hacked).toBeUndefined();
  });

  it.each(['changed', 'missing', 'conflicting', 'unbound'])(
    'rejects %s reCAPTCHA challenge s before writing, dispatching events or invoking a callback',
    (mode) => {
      const f = fixture();
      const { container, frame, response } = f.widget('RECAPTCHA_V2_ENTERPRISE');
      const callback = vi.fn();
      f.root.done = callback;
      container.attributes['data-callback'] = 'done';
      if (mode !== 'missing') {
        container.attributes['data-s'] =
          mode === 'changed' ? 'new-challenge' : 'original-challenge';
        frame.attributes.src += `&s=${mode === 'changed' || mode === 'conflicting' ? 'new-challenge' : 'original-challenge'}`;
      }
      const target = {
        ...f.target('RECAPTCHA_V2_ENTERPRISE'),
        ...(mode === 'unbound' ? {} : { challenge: { s: 'original-challenge' } })
      };
      expect(() => f.run(buildCaptchaApplication(target, 'old-task-token'))).toThrow(/CAPTCHA s/);
      expect(response.value).toBe('');
      expect(response.events).toEqual([]);
      expect(callback).not.toHaveBeenCalled();
      expect(f.form.submit).not.toHaveBeenCalled();
    }
  );

  it('accepts matching DOM, anchor and registered s only when all belong to the selected widget', () => {
    const f = fixture();
    const { container, frame, response } = f.widget('RECAPTCHA_V2_ENTERPRISE');
    container.attributes['data-s'] = 'same-challenge';
    frame.attributes.src += '&s=same-challenge';
    const callback = vi.fn();
    f.root.___grecaptcha_cfg = {
      clients: {
        0: { config: { sitekey: 'observed-key', s: 'same-challenge', callback } },
        8: { config: { sitekey: 'observed-key', s: 'other-widget-challenge', callback: vi.fn() } }
      }
    };
    const result = f.run(
      buildCaptchaApplication(
        { ...f.target('RECAPTCHA_V2_ENTERPRISE'), challenge: { s: 'same-challenge' } },
        'matched-token'
      )
    );
    expect(result).toMatchObject({ applied: true, method: 'callback' });
    expect(response.value).toBe('matched-token');
    expect(callback).toHaveBeenCalledWith('matched-token');
  });

  it('can verify s from a matching current registry without an initialization hook', () => {
    const f = fixture();
    const { response } = f.widget('RECAPTCHA_V2_ENTERPRISE');
    f.root.___grecaptcha_cfg = {
      clients: { 0: { config: { sitekey: 'observed-key', s: 'runtime-challenge' } } }
    };
    expect(
      f.run(
        buildCaptchaApplication(
          { ...f.target('RECAPTCHA_V2_ENTERPRISE'), challenge: { s: 'runtime-challenge' } },
          'answer'
        )
      )
    ).toMatchObject({ applied: true });
    expect(response.value).toBe('answer');
  });

  it('checks registered challenge inputs even when a declared named callback exists', () => {
    const f = fixture();
    const { container, response } = f.widget('RECAPTCHA_V2_ENTERPRISE');
    const callback = vi.fn();
    f.root.done = callback;
    container.attributes['data-callback'] = 'done';
    f.root.___grecaptcha_cfg = {
      clients: { 0: { config: { sitekey: 'observed-key', s: 'new-challenge' } } }
    };
    expect(() =>
      f.run(
        buildCaptchaApplication(
          { ...f.target('RECAPTCHA_V2_ENTERPRISE'), challenge: { s: 'old-challenge' } },
          'old-token'
        )
      )
    ).toThrow('CAPTCHA s');
    expect(response.value).toBe('');
    expect(response.events).toEqual([]);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([
    ['action', 'data-action'],
    ['data', 'data-cdata'],
    ['pagedata', 'data-chlpagedata']
  ] as const)('rejects a refreshed Turnstile %s before any application', (field, attribute) => {
    const f = fixture();
    const { container, response } = f.widget('CLOUDFLARE_TURNSTILE');
    container.attributes[attribute] = 'new-value';
    const target = { ...f.target('CLOUDFLARE_TURNSTILE'), challenge: { [field]: 'old-value' } };
    const expression = buildCaptchaApplication(target, 'answer');
    expect(() => f.run(expression)).toThrow(`CAPTCHA ${field}`);
    expect(response.value).toBe('');
    expect(response.events).toEqual([]);
    container.attributes[attribute] = 'old-value';
    expect(f.run(expression)).toMatchObject({ applied: true });
    expect(response.value).toBe('answer');
  });

  it('requires verifiable reCAPTCHA action and User-Agent bindings when supplied', () => {
    const f = fixture();
    const { container, response } = f.widget();
    const target = { ...f.target(), challenge: { action: 'login', userAgent: 'original-UA' } };
    const expression = buildCaptchaApplication(target, 'answer');
    expect(() => f.run(expression)).toThrow('CAPTCHA action');
    container.attributes['data-action'] = 'login';
    f.root.navigator = { userAgent: 'different-UA' };
    expect(() => f.run(expression)).toThrow('User-Agent changed');
    expect(response.value).toBe('');
    expect(response.events).toEqual([]);
    f.root.navigator.userAgent = 'original-UA';
    expect(f.run(expression)).toMatchObject({ applied: true });
  });

  it.each(['callback', 'event'])(
    'never replays after a throwing %s may have sent a request',
    (failure) => {
      const f = fixture();
      const { container, response } = f.widget();
      const sideEffect = vi.fn(() => {
        throw new Error('Site effect failed');
      });
      if (failure === 'callback') {
        f.root.done = sideEffect;
        container.attributes['data-callback'] = 'done';
      } else response.onDispatch = sideEffect;
      const expression = buildCaptchaApplication(f.target(), 'answer');
      expect(() => f.run(expression)).toThrow('Site effect failed');
      expect(f.run(expression)).toMatchObject({
        applied: false,
        alreadyAttempted: true,
        applicationOutcome: 'UNKNOWN'
      });
      expect(sideEffect).toHaveBeenCalledTimes(1);
      expect(f.form.submit).not.toHaveBeenCalled();
    }
  );

  it('rejects unsupported products, missing tokens and non-web URLs before generating code', () => {
    const f = fixture();
    expect(() => buildCaptchaApplication(f.target('GRID'), 'answer')).toThrow('no supported');
    expect(() => buildCaptchaApplication(f.target(), '')).toThrow('nonempty');
    expect(() =>
      buildCaptchaApplication({ ...f.target(), url: 'file:///private' }, 'answer')
    ).toThrow('HTTP(S)');
    expect(() => buildCaptchaApplication({ ...f.target(), selector: '' }, 'answer')).toThrow(
      'selector'
    );
  });
});
