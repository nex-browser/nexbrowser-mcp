import { parse } from 'parse5';

interface HtmlNode {
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
}

export interface CaptchaObservation {
  productCode: string;
  websiteKey?: string;
  selector?: string;
  initialized: boolean;
  conflict?: string;
  fields: Record<string, string>;
}

/** 只读取已解析的属性；脚本、表单值和事件处理器不执行也不转发。 */
function attributes(node: HtmlNode) {
  return Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
}

function widgetClass(node: HtmlNode, name: string) {
  return attributes(node).class?.split(/\s+/).includes(name) === true;
}

/** 有界解析当前 HTML，按容器保留同 key 的不同控件，不把图片框当作 GRID。 */
export function inspectCaptchaHtml(html: string): CaptchaObservation[] {
  const document = parse(html) as unknown as HtmlNode;
  const nodes: HtmlNode[] = [document];
  for (let i = 0; i < nodes.length; i++) {
    if (nodes.length > 50_000)
      throw new Error('HTML contains too many nodes; supply the CAPTCHA frame or widget HTML.');
    nodes.push(...(nodes[i]?.childNodes ?? []));
  }
  const widgets = new Map<HtmlNode, CaptchaObservation>();
  const anchorCounts = new Map<HtmlNode, number>();
  for (const node of nodes) {
    const attrs = attributes(node);
    const recaptcha = widgetClass(node, 'g-recaptcha');
    const turnstile = widgetClass(node, 'cf-turnstile');
    if (!recaptcha && !turnstile) continue;
    const fields: Record<string, string> = {};
    for (const key of ['size', 's', 'action', 'cdata', 'chlpagedata']) {
      if (attrs[`data-${key}`]) fields[key] = attrs[`data-${key}`]!;
    }
    widgets.set(node, {
      productCode: recaptcha ? 'RECAPTCHA_V2' : 'CLOUDFLARE_TURNSTILE',
      websiteKey: attrs['data-sitekey'],
      selector: attrs.id && /^[\w-]+$/.test(attrs.id) ? `[id="${attrs.id}"]` : undefined,
      initialized: turnstile,
      fields
    });
  }
  for (const frame of nodes.filter((node) => node.tagName === 'iframe')) {
    let url: URL;
    try {
      url = new URL(attributes(frame).src ?? '');
    } catch {
      continue;
    }
    if (!['https:', 'http:'].includes(url.protocol)) continue;
    const recaptcha =
      [
        'www.google.com',
        'google.com',
        'www.recaptcha.net',
        'recaptcha.net',
        'recaptcha.google.com'
      ].includes(url.hostname) && /^\/recaptcha\/(api2|enterprise)\/anchor$/.test(url.pathname);
    const turnstile =
      url.hostname === 'challenges.cloudflare.com' && url.pathname.includes('/turnstile/');
    if (!recaptcha && !turnstile) continue;
    let container: HtmlNode | undefined = frame;
    while (container && !widgets.has(container)) container = container.parentNode;
    container ??= frame;
    const prior = widgets.get(container);
    const anchorCount = (anchorCounts.get(container) ?? 0) + 1;
    anchorCounts.set(container, anchorCount);
    const key = recaptcha ? (url.searchParams.get('k') ?? undefined) : prior?.websiteKey;
    const fields = { ...prior?.fields };
    for (const name of ['size', 's']) {
      const value = url.searchParams.get(name);
      if (value) fields[name] = value;
    }
    widgets.set(container, {
      ...prior,
      productCode: recaptcha
        ? url.pathname.includes('/enterprise/')
          ? 'RECAPTCHA_V2_ENTERPRISE'
          : 'RECAPTCHA_V2'
        : 'CLOUDFLARE_TURNSTILE',
      websiteKey: key ?? prior?.websiteKey,
      initialized: true,
      conflict:
        anchorCount > 1
          ? 'Multiple anchor iframes share a container; inspect the intended widget before purchasing.'
          : prior?.fields.s && fields.s && prior.fields.s !== fields.s
            ? 'Container and anchor challenge parameters differ; inspect the current challenge.'
            : prior?.websiteKey && key && prior.websiteKey !== key
              ? 'Container sitekey and anchor sitekey differ; inspect the current widget.'
              : prior?.conflict,
      fields
    });
  }
  return [...widgets.values()];
}
