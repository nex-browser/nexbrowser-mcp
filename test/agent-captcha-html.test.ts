import { describe, expect, it } from 'vitest';
import { inspectCaptchaHtml } from '../src/features/captcha/agent-captcha-html.js';

describe('agent HTML CAPTCHA observations', () => {
  it('parses entities and only reads widget parameters, never script or credential values', () => {
    const rows = inspectCaptchaHtml(`<form><input name="password" value="secret-password"></form>
      <script>throw new Error('must-not-execute')</script>
      <div class="g-recaptcha" data-sitekey="key&amp;id" data-s="challenge-s">
        <iframe src="https://www.google.com/recaptcha/enterprise/anchor?k=key%26id&amp;size=normal"></iframe>
      </div>`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productCode: 'RECAPTCHA_V2_ENTERPRISE',
      websiteKey: 'key&id',
      initialized: true,
      fields: { s: 'challenge-s', size: 'normal' }
    });
    expect(JSON.stringify(rows)).not.toContain('secret-password');
  });

  it('keeps two widgets with the same key separate for explicit selection', () => {
    const html = [1, 2]
      .map(
        (id) =>
          `<div id="widget-${id}" class="g-recaptcha" data-sitekey="same"><iframe src="https://www.recaptcha.net/recaptcha/api2/anchor?k=same"></iframe></div>`
      )
      .join('');
    const rows = inspectCaptchaHtml(html);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.selector)).toEqual(['[id="widget-1"]', '[id="widget-2"]']);
  });

  it.each([
    '<div class="g-recaptcha" data-sitekey="first"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=other"></iframe></div>',
    '<div class="g-recaptcha" data-sitekey="key" data-s="first"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=key&amp;s=other"></iframe></div>',
    '<div class="g-recaptcha" data-sitekey="key"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=key"></iframe><iframe src="https://www.google.com/recaptcha/api2/anchor?k=key"></iframe></div>'
  ])('reports conflicting or ambiguous page evidence', (html) => {
    expect(inspectCaptchaHtml(html)[0]?.conflict).toBeTruthy();
  });

  it('ignores spoofed iframe hosts and never infers GRID from arbitrary images', () => {
    expect(
      inspectCaptchaHtml(
        '<iframe src="https://www.google.com.evil.test/recaptcha/api2/anchor?k=key"></iframe><img src="grid.jpg">'
      )
    ).toEqual([]);
  });

  it('extracts implicit Turnstile fields without requiring an initialization hook', () => {
    expect(
      inspectCaptchaHtml(
        '<div class="cf-turnstile" data-sitekey="turnstile-key" data-action="login" data-cdata="public-data"></div>'
      )[0]
    ).toMatchObject({
      productCode: 'CLOUDFLARE_TURNSTILE',
      websiteKey: 'turnstile-key',
      fields: { action: 'login', cdata: 'public-data' }
    });
  });
});
